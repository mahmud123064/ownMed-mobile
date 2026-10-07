import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, users } from "../db/index.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { normalizeShareId } from "../utils/shareId.js";
import { validate } from "../utils/validate.js";
import { domainSnapshot, domainWriteSchema, mergeDomain } from "./sync.js";

export const familyRouter = Router();

/**
 * Managing a family member's data by Family ID.
 *
 * These routes are deliberately **unauthenticated**: the whole point is that a
 * relative who has just installed the app — with no account of their own — can
 * type in a Family ID and start recording medicines for the person who shared
 * it. The 8-character code *is* the credential.
 *
 * The tradeoff is explicit: anyone who learns a code gets read and append
 * access to that account's medicines and family members. The write path is
 * add-only (see `mergeDomain` — `onConflictDoNothing`, no update, no delete), so
 * the worst case is spurious records rather than lost or altered ones. Moving to
 * invite/accept with signed tokens is the natural next step; until then the
 * lookup is the thing to rate-limit.
 *
 * The account owner's health profile is never in scope here.
 */

// Loose on length — the code's real shape is enforced by the lookup — but
// normalized so a typed code with stray spaces or lowercase still resolves.
const shareIdSchema = z.string().trim().min(1).transform(normalizeShareId);

const connectSchema = z.object({ shareId: shareIdSchema });

/** Resolve a code to its account, or 404 in the same words either way. */
async function userByShareId(shareId: string) {
  const [user] = await db
    .select({ id: users.id, name: users.name, shareId: users.shareId })
    .from(users)
    .where(eq(users.shareId, shareId))
    .limit(1);

  if (!user) {
    throw ApiError.notFound("No account found for that Family ID");
  }
  return user;
}

/**
 * Who the code belongs to. A separate call from the data read so the client can
 * show "Connect to Salma?" and get a clear "no such ID" before pulling anything.
 */
familyRouter.post(
  "/connect",
  asyncHandler(async (req, res) => {
    const { shareId } = validate(connectSchema, req.body);
    const user = await userByShareId(shareId);
    res.json({ shareId: user.shareId, name: user.name });
  }),
);

/** The linked account's medicines and family members. */
familyRouter.get(
  "/:shareId",
  asyncHandler(async (req, res) => {
    const shareId = validate(shareIdSchema, req.params.shareId);
    const user = await userByShareId(shareId);
    res.json(await domainSnapshot(user.id));
  }),
);

/**
 * Append to the linked account's data. Same payload and same add-only merge as
 * an ordinary sync — see `mergeDomain`, which also guarantees an id already
 * owned by a third account is skipped rather than reassigned.
 */
familyRouter.post(
  "/:shareId",
  asyncHandler(async (req, res) => {
    const shareId = validate(shareIdSchema, req.params.shareId);
    const user = await userByShareId(shareId);
    const input = validate(domainWriteSchema, req.body);

    await mergeDomain(user.id, input);

    res.json(await domainSnapshot(user.id));
  }),
);
