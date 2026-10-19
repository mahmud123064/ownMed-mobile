import "dotenv/config";
import { afterAll, beforeAll } from "vitest";

/**
 * Test environment.
 *
 * This file is loaded *before* the test module, which matters because
 * `src/config/env.ts` reads and freezes `process.env` at import time. Every
 * override below therefore has to happen here, not in a test file.
 */

const requestedNodeEnv = process.env.NODE_ENV ?? "development";
if (requestedNodeEnv === "production") {
  throw new Error(
    "Refusing to run tests with NODE_ENV=production: the suites create and delete accounts.",
  );
}

process.env.NODE_ENV = "test";

/**
 * Rate limiters key on the client address. Without a trusted proxy every
 * request in the suite shares 127.0.0.1 and the sixth registration would get a
 * 429. With `TRUST_PROXY=true` and a per-test `X-Forwarded-For` header each test
 * gets its own bucket — see `test/helpers.ts`.
 */
process.env.TRUST_PROXY = "true";

// The password-reset routes answer 503 without these. The tests mock the actual
// send, so a placeholder is enough to exercise the route body without emailing
// anyone.
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test_placeholder";
process.env.RESEND_FROM = process.env.RESEND_FROM || "OwnMed <test@ownmed.test>";

/**
 * Where the tests may write.
 *
 * `TEST_DATABASE_URL` is the intended target. Falling back to `DATABASE_URL`
 * keeps a fresh clone runnable, but it means the suites create rows in the dev
 * database — they are confined to `*@ownmed.test` accounts and deleted again in
 * `afterAll`, and every table cascades from `users`, so nothing else is
 * touched.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  console.warn(
    "[tests] TEST_DATABASE_URL is not set — using DATABASE_URL. " +
      "Only *@ownmed.test accounts are created, and they are deleted afterwards.",
  );
}

const TEST_EMAIL_PATTERN = "%@ownmed.test";

/** Delete every account a test could have created. Cascades handle the rest. */
async function removeTestAccounts(): Promise<void> {
  const { pool } = await import("../src/db/pool.js");
  await pool.query("delete from users where email like $1", [TEST_EMAIL_PATTERN]);
}

beforeAll(async () => {
  const { pool } = await import("../src/db/pool.js");

  try {
    await pool.query("select 1 from users limit 1");
  } catch (error) {
    throw new Error(
      "The test database is unreachable or has not been migrated. " +
        "Check TEST_DATABASE_URL / DATABASE_URL and run `npm run db:migrate`.",
      { cause: error },
    );
  }

  // Clear anything a previous crashed run left behind.
  await removeTestAccounts();
});

afterAll(async () => {
  const { pool } = await import("../src/db/pool.js");
  try {
    await removeTestAccounts();
  } finally {
    await pool.end();
  }
});
