import { randomUUID } from "node:crypto";

import request from "supertest";

import { app } from "../src/app.js";
import { pool } from "../src/db/pool.js";
import { hashPassword } from "../src/utils/password.js";
import { generateShareId } from "../src/utils/shareId.js";
import { signAccessToken } from "../src/utils/tokens.js";

/** Every account a test creates lives under this domain, so cleanup is exact. */
export const TEST_EMAIL_DOMAIN = "ownmed.test";

export const DEFAULT_PASSWORD = "correct-horse-123";

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
}

/**
 * A distinct client address per call.
 *
 * The app trusts one proxy hop in tests (see `setup.ts`), so the limiter reads
 * this header. Unique addresses keep independent tests out of each other's
 * buckets — and let the rate-limit tests deliberately share one.
 */
let ipSequence = 0;
export function uniqueIp(): string {
  ipSequence += 1;
  const a = 1 + (Math.floor(ipSequence / 65_536) % 200);
  const b = Math.floor(ipSequence / 256) % 256;
  const c = (ipSequence % 254) + 1;
  return `10.${a}.${b}.${c}`;
}

/**
 * A thin wrapper over supertest that pins the caller's address.
 *
 * Each method returns supertest's `Test`, so `.set()`, `.send()` and `.expect()`
 * chain as usual.
 */
export function api(ip: string = uniqueIp()) {
  const withIp = <T extends { set(field: string, value: string): T }>(test: T): T =>
    test.set("X-Forwarded-For", ip);

  return {
    ip,
    get: (url: string) => withIp(request(app).get(url)),
    options: (url: string) => withIp(request(app).options(url)),
    post: (url: string) => withIp(request(app).post(url)),
    put: (url: string) => withIp(request(app).put(url)),
    patch: (url: string) => withIp(request(app).patch(url)),
    delete: (url: string) => withIp(request(app).delete(url)),
  };
}

export type TestAccount = {
  id: string;
  name: string;
  email: string;
  password: string;
  shareId: string;
  accessToken: string;
  refreshToken: string;
  /** Ready for `Authorization`. */
  auth: string;
  ip: string;
};

/** Create an account through the real registration route. */
export async function registerUser(
  overrides: {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
  } = {},
  ip: string = uniqueIp(),
): Promise<TestAccount> {
  const email = overrides.email ?? uniqueEmail("register");
  const password = overrides.password ?? DEFAULT_PASSWORD;

  const res = await api(ip)
    .post("/auth/register")
    .send({
      name: overrides.name ?? "Test User",
      email,
      password,
      ...(overrides.phone === undefined ? {} : { phone: overrides.phone }),
    })
    .expect(201);

  return {
    ...res.body.user,
    password,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    auth: `Bearer ${res.body.accessToken}`,
    ip,
  };
}

/**
 * Insert a user straight into the database and sign a token for it.
 *
 * Registration costs a bcrypt hash at 12 rounds; most suites only need an
 * account to own rows, so they use this instead. The hash is computed once per
 * test file and reused — bcrypt salts are per-call, but all these fixtures want
 * the same password anyway.
 */
let sharedHash: Promise<string> | null = null;
function defaultHash(): Promise<string> {
  sharedHash ??= hashPassword(DEFAULT_PASSWORD);
  return sharedHash;
}

export async function createUserDirect(
  overrides: { name?: string; email?: string; password?: string } = {},
): Promise<TestAccount> {
  const email = overrides.email ?? uniqueEmail("direct");
  const password = overrides.password ?? DEFAULT_PASSWORD;
  const passwordHash = await defaultHash();

  for (let attempt = 0; attempt < 20; attempt++) {
    const shareId = generateShareId();
    try {
      const { rows } = await pool.query<{
        id: string;
        name: string;
        email: string;
        share_id: string;
      }>(
        `insert into users (name, email, password_hash, share_id)
         values ($1, $2, $3, $4)
         returning id, name, email, share_id`,
        [overrides.name ?? "Direct User", email, passwordHash, shareId],
      );

      const row = rows[0]!;
      const accessToken = signAccessToken({ sub: row.id, email: row.email });
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        password,
        // A direct user has no refresh-token row; tests that need one log in.
        refreshToken: "",
        shareId: row.share_id,
        accessToken,
        auth: `Bearer ${accessToken}`,
        ip: uniqueIp(),
      };
    } catch (error) {
      // 23505: the generated share id (or the email) already exists. A new
      // share id is all a retry needs; a duplicate email is the caller's
      // problem and will exhaust the loop with a clear failure.
      if ((error as { code?: string }).code !== "23505") throw error;
    }
  }

  throw new Error(`Could not create a direct test user for ${email}`);
}

/** Assert the response carries the API's single error shape. */
export function expectApiError(
  res: { status: number; body: unknown },
  status: number,
  message?: string | RegExp,
): void {
  if (res.status !== status) {
    throw new Error(
      `Expected HTTP ${status} but got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }

  const body = res.body as {
    error?: { message?: unknown; statusCode?: unknown };
  };
  if (!body.error) {
    throw new Error(`Expected an error body but got ${JSON.stringify(res.body)}`);
  }
  if (body.error.statusCode !== status) {
    throw new Error(
      `Expected error.statusCode ${status} but got ${String(body.error.statusCode)}`,
    );
  }
  if (message !== undefined) {
    const actual = String(body.error.message ?? "");
    const matches =
      typeof message === "string" ? actual === message : message.test(actual);
    if (!matches) {
      throw new Error(
        `Expected error message ${String(message)} but got "${actual}"`,
      );
    }
  }
}
