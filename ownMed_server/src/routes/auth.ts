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

/** Strip the password hash before a user ever leaves the server. */
function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
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
