import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";

/**
 * Per-IP throttles for the endpoints an attacker would otherwise be free to
 * hammer: the password surface (guessing, account enumeration, reset-code
 * brute force), the unauthenticated `/family/connect` lookup, and the family
 * data routes a holder of a code could otherwise spam.
 *
 * The store is express-rate-limit's in-memory default, which is honest for a
 * single-instance deploy and wrong behind more than one — each instance then
 * keeps its own counts and the effective limit multiplies by the instance
 * count. A shared store (Redis) is the fix when that day comes. The
 * reset-code attempt cap in `routes/auth.ts` is the part that holds regardless
 * of topology, because it counts against the database row rather than memory.
 */

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function createLimiter(options: {
  limit: number;
  message: string;
  windowMs?: number;
  /**
   * Whether successful requests are free. True for the surfaces where the
   * threat is *guessing* — charging for correct sign-ins would lock out real
   * users long before it inconvenienced an attacker, who by definition fails.
   * False where the threat is *volume* under a credential that already works:
   * a family-code holder appending endlessly succeeds every time, so successes
   * have to count or the limit never bites.
   */
  skipSuccessful?: boolean;
}): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs ?? FIFTEEN_MINUTES,
    limit: options.limit,
    // RFC 9422 `RateLimit-*` headers; the older `X-RateLimit-*` pair is off.
    standardHeaders: true,
    legacyHeaders: false,
    /**
     * Only failures consume the budget by default (see the option above). A
     * blocked request does not reset the count, so a determined guesser still
     * runs out.
     */
    skipSuccessfulRequests: options.skipSuccessful ?? true,
    // Shaped like `errorHandler`'s output so a 429 needs no special case in
    // the client's error parsing.
    message: { error: { message: options.message, statusCode: 429 } },
  });
}

export const loginLimiter = createLimiter({
  limit: 10,
  message: "Too many sign-in attempts. Try again in a few minutes.",
});

/** Separate instance from `loginLimiter`, so the two do not share a bucket. */
export const changePasswordLimiter = createLimiter({
  limit: 10,
  message: "Too many password attempts. Try again in a few minutes.",
});

/**
 * Account deletion. Its own bucket, like the other password surfaces: a wrong
 * password here should not spend the login budget, and repeated guesses are
 * exactly what this route has to bound.
 */
export const deleteAccountLimiter = createLimiter({
  limit: 10,
  message: "Too many account deletion attempts. Try again in a few minutes.",
});

export const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: "Too many accounts created from this address. Try again later.",
});

export const passwordResetRequestLimiter = createLimiter({
  limit: 5,
  message: "Too many reset codes requested. Try again in a few minutes.",
});

export const passwordResetConfirmLimiter = createLimiter({
  limit: 10,
  message: "Too many attempts. Try again in a few minutes.",
});

/**
 * The Family ID lookup. A code is 8 characters from a 31-symbol alphabet, so
 * an unthrottled `/connect` is an enumeration oracle: it answers "does this
 * code exist", which is half of what guessing one needs.
 */
export const connectLimiter = createLimiter({
  limit: 20,
  message: "Too many Family ID lookups. Try again in a few minutes.",
});

/**
 * Reading a linked account's data by code.
 *
 * Successful reads are free, like the lookup above: opening the family screen a
 * dozen times in an evening is ordinary use. The cap exists for a caller
 * sweeping a code it already knows, or retrying a failing one forever.
 */
export const familyReadLimiter = createLimiter({
  limit: 120,
  message: "Too many Family ID requests. Try again in a few minutes.",
});

/**
 * Appending to a linked account's data by code.
 *
 * Unlike every other limiter here, successes count. The threat is not a guesser
 * — a code that works works every time — but a holder spamming records into an
 * account that is not theirs. Each append spends a slot, so the only way to
 * stay under the cap is to stop appending.
 */
export const familyWriteLimiter = createLimiter({
  limit: 100,
  message: "Too many writes to that Family ID. Try again in a few minutes.",
  skipSuccessful: false,
});
