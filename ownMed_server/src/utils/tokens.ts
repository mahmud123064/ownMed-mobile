import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { eq } from "drizzle-orm";

import { env } from "../config/env.js";
import { db, refreshTokens, type User } from "../db/index.js";
import { ApiError } from "./ApiError.js";

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

const ISSUER = "ownmed";
const AUDIENCE = "ownmed-app";

export function signAccessToken(user: AccessTokenPayload): string {
  return jwt.sign(user, env.jwtSecret, {
    // `env.jwtAccessExpiresIn` is a plain string ("15m"); jsonwebtoken's types
    // narrow this to an `ms` template-literal union, hence the cast.
    expiresIn: env.jwtAccessExpiresIn as SignOptions["expiresIn"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.jwtSecret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (typeof payload === "string" || typeof payload.sub !== "string") {
    throw new Error("Access token payload missing sub");
  }

  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : "",
  };
}

/** Opaque refresh token handed to the client; only its hash is stored. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function refreshTokenExpiry(): Date {
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(Date.now() + env.refreshTokenExpiresDays * msPerDay);
}

/** 6-digit numeric reset code, emailed to the user. */
export function generateResetCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashResetCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Compare a submitted reset code against the stored hash, in constant time.
 *
 * Both sides are sha256 hex digests, so they are always the same length and
 * `timingSafeEqual` applies directly. A plain `===` returns as soon as two
 * bytes differ, which leaks how much of the digest a guess got right — a real
 * head start when the search space is only a million codes.
 */
export function resetCodeMatches(code: string, storedHash: string): boolean {
  const submitted = Buffer.from(hashResetCode(code), "hex");
  const stored = Buffer.from(storedHash, "hex");
  // A malformed or truncated stored hash decodes short; comparing lengths
  // first keeps `timingSafeEqual` from throwing on a mismatch.
  if (submitted.length !== stored.length) return false;
  return timingSafeEqual(submitted, stored);
}

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

export function resetCodeExpiry(): Date {
  return new Date(Date.now() + RESET_CODE_TTL_MS);
}

/** Issues a fresh access token and persists a matching refresh-token row. */
export async function issueTokenPair(
  user: User,
): Promise<{ accessToken: string; refreshToken: string }> {
  const refreshToken = generateRefreshToken();
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiry(),
  });

  return {
    accessToken: signAccessToken({
      sub: user.id,
      email: user.email,
    }),
    refreshToken,
  };
}

/**
 * Rotates a refresh token: revokes the old one and issues a new pair.
 *
 * The delete is the guard, not a cleanup step. `returning` reports whether this
 * caller is the one that actually consumed the token, so a token replayed after
 * its rotation — or two requests racing with it, which both pass the route's
 * SELECT — is rejected instead of quietly minting a second live pair.
 */
export async function rotateTokenPair(
  user: User,
  oldTokenHash: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const revoked = await db
    .delete(refreshTokens)
    .where(eq(refreshTokens.tokenHash, oldTokenHash))
    .returning({ id: refreshTokens.id });

  if (revoked.length === 0) {
    throw ApiError.unauthorized("Refresh token already used");
  }

  return issueTokenPair(user);
}
