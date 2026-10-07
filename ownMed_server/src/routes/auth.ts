import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "../config/env.js";
import {
  db,
  passwordResetTokens,
  refreshTokens,
  users,
  type User,
} from "../db/index.js";
import { authenticate } from "../middleware/auth.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendPasswordResetEmail } from "../utils/email.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { generateUniqueShareId } from "../utils/shareId.js";
import { calendarDateSchema } from "./sync.js";
import {
  generateResetCode,
  hashRefreshToken,
  hashResetCode,
  issueTokenPair,
  resetCodeExpiry,
  rotateTokenPair,
} from "../utils/tokens.js";
import { validate } from "../utils/validate.js";

export const authRouter = Router();

// Loose-but-sane email check (mirrors the app's own validation).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(EMAIL_RE, "Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters").max(200),
  phone: z.string().trim().max(30).optional(),
});

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(EMAIL_RE, "Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const passwordResetRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(EMAIL_RE, "Invalid email address"),
});

const passwordResetConfirmSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(EMAIL_RE, "Invalid email address"),
  code: z.string().regex(/^\d{6}$/, "Reset code must be 6 digits"),
  newPassword: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(200),
});

/**
 * The blood groups a user can pick, as the client stores them — the literal
 * label, so there is no enum to translate on the way through. `""` is the
 * unset state, the same convention the rest of this API uses for a blank.
 */
const BLOOD_GROUP_VALUES = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "",
] as const;

const genderValues = ["male", "female", "other", ""] as const;

/**
 * The editable half of a profile.
 *
 * Every field is optional because this is a partial update — the client sends
 * only what changed — and absent keys are left alone rather than blanked. Email
 * is deliberately not here: it is the account's identity and the unique index
 * on it means changing it is a different feature (re-verification), not a
 * profile edit.
 */
const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  gender: z.enum(genderValues).optional(),
  bloodGroup: z.enum(BLOOD_GROUP_VALUES).optional(),
  // Note: *not* `optionalCalendarDateSchema`, which defaults an absent key to
  // `""`. That default is right for sync, where the client always sends the
  // whole record, but here it would silently clear the date on every partial
  // update that did not mention it. Absent must mean "leave alone".
  dateOfBirth: z.union([calendarDateSchema, z.literal("")]).optional(),
});

/**
 * Strip the password hash before a user ever leaves the server.
 *
 * The nullable columns are handed over as `""` rather than `null`, matching how
 * every other blank in this API travels (see `toMedicine`): the client's fields
 * are all strings, so one shape avoids empty-string↔null conversion bugs.
 */
function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    shareId: user.shareId ?? "",
    gender: user.gender ?? "",
    bloodGroup: user.bloodGroup ?? "",
    dateOfBirth: user.dateOfBirth ?? "",
  };
}

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = validate(registerSchema, req.body);

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing.length > 0) {
      throw new ApiError(409, "Email is already registered");
    }

    const passwordHash = await hashPassword(input.password);
    const [user] = await db
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        phone: input.phone ?? null,
        // Every account gets one up front: it is how a family member is given
        // access, and a user who had to "create" it later could not share the
        // ID they had already read out.
        shareId: await generateUniqueShareId(),
      })
      .returning();

    const tokens = await issueTokenPair(user);
    res.status(201).json({ user: toPublicUser(user), ...tokens });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = validate(loginSchema, req.body);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    // Same message whether the email is unknown, the account has no password,
    // or the password is wrong — so the endpoint never reveals which emails
    // are registered.
    if (
      !user ||
      !user.passwordHash ||
      !(await verifyPassword(input.password, user.passwordHash))
    ) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const tokens = await issueTokenPair(user);
    res.json({ user: toPublicUser(user), ...tokens });
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const { refreshToken } = validate(refreshTokenSchema, req.body);
    const tokenHash = hashRefreshToken(refreshToken);

    const [row] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!row) {
      throw ApiError.unauthorized("Invalid refresh token");
    }
    if (row.expiresAt.getTime() < Date.now()) {
      await db
        .delete(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash));
      throw ApiError.unauthorized("Refresh token expired");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    if (!user) {
      throw ApiError.unauthorized("User not found");
    }

    const tokens = await rotateTokenPair(user, tokenHash);
    res.json(tokens);
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const { refreshToken } = validate(refreshTokenSchema, req.body);
    await db
      .delete(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(refreshToken)));
    // Idempotent: logging out an already-revoked token is still a success.
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);
    if (!user) {
      throw ApiError.notFound("User not found");
    }
    res.json({ user: toPublicUser(user) });
  }),
);

authRouter.patch(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const input = validate(updateProfileSchema, req.body);

    // Build the update from the keys actually present, so a partial payload
    // leaves the fields it omits untouched. `undefined` is the "not provided"
    // marker; a provided `""` is a real value (an unset blood group) and must
    // survive, which is why this checks `key in input` rather than truthiness.
    const update: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) update.name = input.name;
    if (input.phone !== undefined) update.phone = input.phone || null;
    if (input.gender !== undefined) update.gender = input.gender || null;
    if (input.bloodGroup !== undefined) {
      update.bloodGroup = input.bloodGroup || null;
    }
    if (input.dateOfBirth !== undefined) {
      update.dateOfBirth = input.dateOfBirth || null;
    }

    const [user] = await db
      .update(users)
      .set(update)
      .where(eq(users.id, req.user!.id))
      .returning();

    if (!user) {
      throw ApiError.notFound("User not found");
    }
    res.json({ user: toPublicUser(user) });
  }),
);

authRouter.post(
  "/password-reset/request",
  asyncHandler(async (req, res) => {
    if (!env.resendApiKey || !env.resendFrom) {
      throw new ApiError(503, "Password reset is not configured");
    }

    const { email } = validate(passwordResetRequestSchema, req.body);

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Always respond the same way whether or not the email is registered, so
    // the endpoint never reveals which emails exist.
    if (user) {
      const code = generateResetCode();
      // One active code per user — invalidate any previous codes first.
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: hashResetCode(code),
        expiresAt: resetCodeExpiry(),
      });
      await sendPasswordResetEmail(user.email, code);
    }

    res.json({
      message:
        "If an account exists for that email, a reset code has been sent.",
    });
  }),
);

authRouter.post(
  "/password-reset/confirm",
  asyncHandler(async (req, res) => {
    const { email, code, newPassword } = validate(
      passwordResetConfirmSchema,
      req.body,
    );

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Same generic message whether the email is unknown, the code is wrong, or
    // the code expired — so the endpoint doesn't reveal account state.
    if (!user) {
      throw ApiError.badRequest("Invalid or expired reset code");
    }

    const tokenHash = hashResetCode(code);
    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          eq(passwordResetTokens.tokenHash, tokenHash),
        ),
      )
      .limit(1);

    if (!token || token.expiresAt.getTime() < Date.now()) {
      throw ApiError.badRequest("Invalid or expired reset code");
    }

    const passwordHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));

    res.json({ message: "Password updated" });
  }),
);
