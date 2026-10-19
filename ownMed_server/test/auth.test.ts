import { beforeEach, describe, expect, it, vi } from "vitest";

import { pool } from "../src/db/pool.js";
import { verifyPassword } from "../src/utils/password.js";
import { verifyAccessToken } from "../src/utils/tokens.js";
import {
  DEFAULT_PASSWORD,
  api,
  expectApiError,
  registerUser,
  uniqueEmail,
  uniqueIp,
} from "./helpers.js";

/**
 * The password-reset routes call Resend. The send is mocked for the whole file:
 * nothing here should put a real email on the wire, and capturing the code is
 * what makes the confirm route testable without reading an inbox.
 */
const emailMocks = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(async (_to: string, _code: string) => {}),
}));
vi.mock("../src/utils/email.js", () => ({
  sendPasswordResetEmail: emailMocks.sendPasswordResetEmail,
}));

beforeEach(() => {
  emailMocks.sendPasswordResetEmail.mockClear();
});

const SHARE_ID_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

describe("authentication — registration", () => {
  it("creates an account, hashes the password, and assigns a Family ID", async () => {
    const user = await registerUser({ name: "Salma Rahman" });

    expect(user).toMatchObject({
      name: "Salma Rahman",
      email: user.email,
    });
    expect(user.shareId).toMatch(SHARE_ID_RE);
    expect(user.accessToken).toEqual(expect.any(String));
    expect(user.refreshToken).toEqual(expect.any(String));

    // The serializer must not leak the hash or a password field. (The helper's
    // own object carries the plaintext for convenience, so the check is made
    // against a server response rather than that object.)
    const me = await api().get("/auth/me").set("Authorization", user.auth);
    expect(me.body.user).not.toHaveProperty("passwordHash");
    expect(me.body.user).not.toHaveProperty("password");

    const { rows } = await pool.query<{ password_hash: string }>(
      "select password_hash from users where id = $1",
      [user.id],
    );
    const hash = rows[0]!.password_hash;
    expect(hash).not.toBe(DEFAULT_PASSWORD);
    expect(hash.startsWith("$2")).toBe(true);
    await expect(verifyPassword(DEFAULT_PASSWORD, hash)).resolves.toBe(true);
    expect(verifyAccessToken(user.accessToken).sub).toBe(user.id);
  });

  it("normalizes the email before storing and checking it", async () => {
    const email = `  Mixed-Case-${Date.now()}@OwnMed.Test  `;
    const user = await registerUser({ email });
    expect(user.email).toBe(email.trim().toLowerCase());

    const { rows } = await pool.query<{ email: string }>(
      "select email from users where id = $1",
      [user.id],
    );
    expect(rows[0]!.email).toBe(email.trim().toLowerCase());
  });

  it("stores the optional phone and returns it", async () => {
    const user = await registerUser({ phone: "+8801700000000" });
    expect((user as unknown as { phone: string }).phone).toBe("+8801700000000");
  });

  it("rejects a duplicate email with 409", async () => {
    const user = await registerUser();

    // A different case and stray whitespace are still the same address.
    const res = await api().post("/auth/register").send({
      name: "Someone Else",
      email: `  ${user.email.toUpperCase()} `,
      password: "another-password",
    });

    expectApiError(res, 409, "Email is already registered");
  });

  it("rejects malformed input with 400s", async () => {
    expectApiError(
      await api()
        .post("/auth/register")
        .send({ name: "A", email: "not-an-email", password: "123456" }),
      400,
      "email: Invalid email address",
    );

    expectApiError(
      await api()
        .post("/auth/register")
        .send({ name: "A", email: uniqueEmail(), password: "123" }),
      400,
      "password: Password must be at least 6 characters",
    );

    const missingName = await api()
      .post("/auth/register")
      .send({ email: uniqueEmail(), password: "123456" });
    expect(missingName.status).toBe(400);
    expect(missingName.body.error.statusCode).toBe(400);
  });

  it("throttles repeated failed registrations from one address", async () => {
    const ip = uniqueIp();
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await api(ip)
        .post("/auth/register")
        .send({ name: "A", email: "bad-email", password: "123456" });
      expect(res.status).toBe(400);
    }

    const blocked = await api(ip)
      .post("/auth/register")
      .send({ name: "A", email: "bad-email", password: "123456" });
    expectApiError(blocked, 429);
    expect(blocked.body.error.message).toMatch(/Too many accounts created/i);
  });
});

describe("authentication — login", () => {
  it("returns the user and a token pair", async () => {
    const user = await registerUser({ email: `Login-${Date.now()}@OwnMed.Test` });

    const res = await api().post("/auth/login").send({
      email: user.email.toUpperCase(),
      password: DEFAULT_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it("does not reveal whether the email exists", async () => {
    const user = await registerUser();

    const wrongPassword = await api().post("/auth/login").send({
      email: user.email,
      password: "definitely-wrong",
    });
    const unknownEmail = await api().post("/auth/login").send({
      email: uniqueEmail("nobody"),
      password: "definitely-wrong",
    });

    expectApiError(wrongPassword, 401, "Invalid email or password");
    expectApiError(unknownEmail, 401, "Invalid email or password");
  });

  it("validates the body", async () => {
    expectApiError(
      await api().post("/auth/login").send({ email: "nope", password: "" }),
      400,
      "email: Invalid email address",
    );
  });
});

describe("authentication — sessions", () => {
  it("requires a bearer token on /auth/me", async () => {
    expectApiError(await api().get("/auth/me"), 401, "Missing bearer token");

    expectApiError(
      await api().get("/auth/me").set("Authorization", "Basic abc"),
      401,
      "Missing bearer token",
    );

    expectApiError(
      await api().get("/auth/me").set("Authorization", "Bearer not-a-jwt"),
      401,
      "Invalid or expired token",
    );
  });

  it("returns the signed-in user", async () => {
    const user = await registerUser();
    const res = await api().get("/auth/me").set("Authorization", user.auth);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("rotates the refresh token and refuses a replayed one", async () => {
    const user = await registerUser();

    const rotated = await api()
      .post("/auth/refresh")
      .send({ refreshToken: user.refreshToken });

    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).not.toBe(user.refreshToken);
    expect(rotated.body.accessToken).toEqual(expect.any(String));

    // The old token was consumed by the rotation. A replay fails the lookup
    // outright ("Refresh token already used" is the concurrent-rotation guard,
    // reached only when two requests race past the SELECT).
    expectApiError(
      await api()
        .post("/auth/refresh")
        .send({ refreshToken: user.refreshToken }),
      401,
      "Invalid refresh token",
    );

    // The replacement works.
    const again = await api()
      .post("/auth/refresh")
      .send({ refreshToken: rotated.body.refreshToken });
    expect(again.status).toBe(200);
  });

  it("rejects an unknown and an expired refresh token", async () => {
    expectApiError(
      await api().post("/auth/refresh").send({ refreshToken: "made-up" }),
      401,
      "Invalid refresh token",
    );

    const user = await registerUser();
    const { rows } = await pool.query<{ token_hash: string }>(
      "select token_hash from refresh_tokens where user_id = $1 limit 1",
      [user.id],
    );
    const expiredToken = "expired-token-value";
    await pool.query(
      "delete from refresh_tokens where user_id = $1",
      [user.id],
    );
    await pool.query(
      `insert into refresh_tokens (user_id, token_hash, expires_at)
       values ($1, encode(sha256($2::bytea), 'hex'), $3)`,
      [user.id, expiredToken, new Date(Date.now() - 60_000)],
    );
    expect(rows.length).toBe(1);

    expectApiError(
      await api().post("/auth/refresh").send({ refreshToken: expiredToken }),
      401,
      "Refresh token expired",
    );

    const { rows: left } = await pool.query(
      "select 1 from refresh_tokens where user_id = $1",
      [user.id],
    );
    expect(left).toHaveLength(0);
  });

  it("logs out idempotently and revokes the refresh token", async () => {
    const user = await registerUser();

    const first = await api()
      .post("/auth/logout")
      .send({ refreshToken: user.refreshToken });
    expect(first.status).toBe(204);

    expectApiError(
      await api()
        .post("/auth/refresh")
        .send({ refreshToken: user.refreshToken }),
      401,
      "Invalid refresh token",
    );

    const second = await api()
      .post("/auth/logout")
      .send({ refreshToken: user.refreshToken });
    expect(second.status).toBe(204);
  });
});

describe("authentication — profile", () => {
  it("updates only the fields that were sent", async () => {
    const user = await registerUser({ phone: "+8801000000000" });

    const res = await api()
      .patch("/auth/me")
      .set("Authorization", user.auth)
      .send({
        name: "Updated Name",
        gender: "female",
        bloodGroup: "O+",
        dateOfBirth: "1990-04-12",
      });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: "Updated Name",
      phone: "+8801000000000",
      gender: "female",
      bloodGroup: "O+",
      dateOfBirth: "1990-04-12",
      email: user.email,
    });

    // A later partial update leaves the earlier fields alone.
    const second = await api()
      .patch("/auth/me")
      .set("Authorization", user.auth)
      .send({ name: "Renamed Again" });

    expect(second.body.user).toMatchObject({
      name: "Renamed Again",
      phone: "+8801000000000",
      gender: "female",
      bloodGroup: "O+",
      dateOfBirth: "1990-04-12",
    });
  });

  it("treats an explicit empty string as a real value", async () => {
    const user = await registerUser({ phone: "+8801000000000" });

    const res = await api()
      .patch("/auth/me")
      .set("Authorization", user.auth)
      .send({ phone: "", bloodGroup: "" });

    expect(res.body.user.phone).toBe("");
    expect(res.body.user.bloodGroup).toBe("");

    const { rows } = await pool.query<{
      phone: string | null;
      blood_group: string | null;
    }>("select phone, blood_group from users where id = $1", [user.id]);
    expect(rows[0]).toEqual({ phone: null, blood_group: null });
  });

  it("validates gender, blood group and date", async () => {
    const user = await registerUser();

    expectApiError(
      await api()
        .patch("/auth/me")
        .set("Authorization", user.auth)
        .send({ bloodGroup: "Z+" }),
      400,
    );

    expectApiError(
      await api()
        .patch("/auth/me")
        .set("Authorization", user.auth)
        .send({ gender: "unknown" }),
      400,
    );

    // A union reports its own "invalid input" issue, so only the path is
    // guaranteed; the day-existence check is covered directly in sync tests.
    const badDate = await api()
      .patch("/auth/me")
      .set("Authorization", user.auth)
      .send({ dateOfBirth: "2026-02-30" });
    expectApiError(badDate, 400);
    expect(String(badDate.body.error.message)).toMatch(/^dateOfBirth:/);
  });

  it("ignores an email in the body — identity is not a profile edit", async () => {
    const user = await registerUser();
    const res = await api()
      .patch("/auth/me")
      .set("Authorization", user.auth)
      .send({ email: uniqueEmail("hijack") });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
  });
});

describe("authentication — change password", () => {
  it("requires the current password", async () => {
    const user = await registerUser();

    expectApiError(
      await api()
        .post("/auth/change-password")
        .set("Authorization", user.auth)
        .send({ currentPassword: "wrong", newPassword: "new-password-123" }),
      401,
      "Current password is incorrect",
    );
  });

  it("changes the password and revokes every refresh token", async () => {
    const user = await registerUser();

    const res = await api()
      .post("/auth/change-password")
      .set("Authorization", user.auth)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: "brand-new-password",
      });
    expect(res.status).toBe(200);

    // Old sessions can no longer renew.
    expectApiError(
      await api()
        .post("/auth/refresh")
        .send({ refreshToken: user.refreshToken }),
      401,
    );

    // Every refresh token went with the change — checked before the logins
    // below, which create new ones of their own.
    const { rows } = await pool.query(
      "select 1 from refresh_tokens where user_id = $1",
      [user.id],
    );
    expect(rows).toHaveLength(0);

    // New credentials work; the old ones do not.
    expect(
      (
        await api()
          .post("/auth/login")
          .send({ email: user.email, password: "brand-new-password" })
      ).status,
    ).toBe(200);
    expect(
      (
        await api()
          .post("/auth/login")
          .send({ email: user.email, password: DEFAULT_PASSWORD })
      ).status,
    ).toBe(401);
  });

  it("rejects a short new password", async () => {
    const user = await registerUser();
    expectApiError(
      await api()
        .post("/auth/change-password")
        .set("Authorization", user.auth)
        .send({ currentPassword: DEFAULT_PASSWORD, newPassword: "123" }),
      400,
      "newPassword: Password must be at least 6 characters",
    );
  });
});

describe("authentication — password reset", () => {
  it("answers generically and emails a code for a registered address", async () => {
    const user = await registerUser();
    const res = await api()
      .post("/auth/password-reset/request")
      .send({ email: user.email });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If an account exists/i);
    expect(emailMocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);

    const [, code] = emailMocks.sendPasswordResetEmail.mock.calls[0]!;
    expect(code).toMatch(/^\d{6}$/);
  });

  it("answers identically for an unknown address and sends nothing", async () => {
    const res = await api()
      .post("/auth/password-reset/request")
      .send({ email: uniqueEmail("missing") });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If an account exists/i);
    expect(emailMocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("sets a new password and revokes other sessions", async () => {
    const user = await registerUser();
    await api().post("/auth/password-reset/request").send({ email: user.email });
    const [, code] = emailMocks.sendPasswordResetEmail.mock.calls[0]!;

    const confirm = await api().post("/auth/password-reset/confirm").send({
      email: user.email,
      code,
      newPassword: "reset-password-1",
    });
    expect(confirm.status).toBe(200);

    expect(
      (
        await api().post("/auth/login").send({
          email: user.email,
          password: "reset-password-1",
        })
      ).status,
    ).toBe(200);

    expectApiError(
      await api()
        .post("/auth/refresh")
        .send({ refreshToken: user.refreshToken }),
      401,
    );
  });

  it("burns the code after five wrong guesses", async () => {
    const user = await registerUser();
    const requestIp = uniqueIp();
    await api(requestIp)
      .post("/auth/password-reset/request")
      .send({ email: user.email });
    const [, code] = emailMocks.sendPasswordResetEmail.mock.calls[0]!;

    // The first five mismatches are all refused; the fifth also deletes the row.
    for (let attempt = 0; attempt < 5; attempt++) {
      expectApiError(
        await api(requestIp).post("/auth/password-reset/confirm").send({
          email: user.email,
          code: "000000",
          newPassword: "whatever-123",
        }),
        400,
        "Invalid or expired reset code",
      );
    }

    // Even the right code is useless now.
    expectApiError(
      await api(requestIp).post("/auth/password-reset/confirm").send({
        email: user.email,
        code,
        newPassword: "whatever-123",
      }),
      400,
      "Invalid or expired reset code",
    );

    const { rows } = await pool.query(
      "select 1 from password_reset_tokens where user_id = $1",
      [user.id],
    );
    expect(rows).toHaveLength(0);
  });

  it("rejects an expired code and an unknown address", async () => {
    const user = await registerUser();
    await pool.query(
      `insert into password_reset_tokens (user_id, token_hash, expires_at)
       values ($1, encode(sha256('123456'::bytea), 'hex'), $2)`,
      [user.id, new Date(Date.now() - 60_000)],
    );

    expectApiError(
      await api().post("/auth/password-reset/confirm").send({
        email: user.email,
        code: "123456",
        newPassword: "whatever-123",
      }),
      400,
      "Invalid or expired reset code",
    );

    expectApiError(
      await api().post("/auth/password-reset/confirm").send({
        email: uniqueEmail("missing"),
        code: "123456",
        newPassword: "whatever-123",
      }),
      400,
      "Invalid or expired reset code",
    );
  });

  it("rejects a code that is not six digits", async () => {
    expectApiError(
      await api().post("/auth/password-reset/confirm").send({
        email: uniqueEmail(),
        code: "abc",
        newPassword: "whatever-123",
      }),
      400,
      "code: Reset code must be 6 digits",
    );
  });
});
