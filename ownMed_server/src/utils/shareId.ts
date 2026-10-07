import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";

import { db, users } from "../db/index.js";

/**
 * The shareable "Family ID".
 *
 * A short code the user reads out to a family member so that person can manage
 * their medicines and family members. It is a **bearer credential** — whoever
 * knows it gets that access — so it is generated from `node:crypto` rather than
 * `Math.random`, and the alphabet leaves out the characters people misread when
 * copying a code by hand or over the phone: I, L, O, 0 and 1.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const SHARE_ID_LENGTH = 8;

/** A random code. Uniqueness is the caller's problem — see below. */
export function generateShareId(): string {
  let out = "";
  for (let i = 0; i < SHARE_ID_LENGTH; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

/**
 * Fold user input into the stored form: users type codes with stray spaces and
 * in lowercase, and both are the same code as far as anyone is concerned.
 */
export function normalizeShareId(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * Generate a code no account holds yet.
 *
 * The unique index makes a collision a hard failure, so this is checked up
 * front rather than letting the insert blow up: with a 31-character alphabet
 * and 8 positions a clash is already unlikely, and the retry makes it a
 * non-issue rather than a 500.
 */
export async function generateUniqueShareId(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = generateShareId();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.shareId, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  throw new Error("Could not generate a unique share id");
}
