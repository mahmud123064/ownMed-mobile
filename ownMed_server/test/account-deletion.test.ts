import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { pool } from "../src/db/pool.js";
import {
  DEFAULT_PASSWORD,
  api,
  createUserDirect,
  expectApiError,
  registerUser,
} from "./helpers.js";

/**
 * Account deletion.
 *
 * One `delete from users` is the operation — every child table cascades — plus a
 * best-effort sweep of the user's objects in R2. The sweep is mocked here: it
 * would otherwise make a real bucket request, and what this suite needs to know
 * is that deletion asks for it with the right id.
 */
const r2Mocks = vi.hoisted(() => ({
  deleteUserObjects: vi.fn(async (_userId: string) => {}),
}));
vi.mock("../src/utils/r2.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/r2.js")>();
  return { ...actual, deleteUserObjects: r2Mocks.deleteUserObjects };
});

describe("account deletion — confirmation", () => {
  it("requires a session", async () => {
    expectApiError(
      await api().delete("/auth/me").send({ password: DEFAULT_PASSWORD }),
      401,
    );
  });

  it("requires the password in the body", async () => {
    const user = await createUserDirect();

    expectApiError(
      await api().delete("/auth/me").set("Authorization", user.auth).send({}),
      400,
    );
    expectApiError(
      await api()
        .delete("/auth/me")
        .set("Authorization", user.auth)
        .send({ password: "" }),
      400,
      "password: Password is required",
    );
  });

  it("refuses a wrong password and keeps the account", async () => {
    const user = await createUserDirect();

    expectApiError(
      await api()
        .delete("/auth/me")
        .set("Authorization", user.auth)
        .send({ password: "not-my-password" }),
      401,
      "Password is incorrect",
    );

    const { rows } = await pool.query(
      "select 1 from users where id = $1",
      [user.id],
    );
    expect(rows).toHaveLength(1);

    const me = await api().get("/auth/me").set("Authorization", user.auth);
    expect(me.status).toBe(200);
  });
});

describe("account deletion — cascading removal", () => {
  it("deletes the account, every child row, and the stored objects", async () => {
    const user = await registerUser({ name: "To Be Deleted" });
    const medicineId = randomUUID();
    const familyId = randomUUID();
    const reportId = randomUUID();

    await pool.query(
      "insert into health_profiles (user_id, weight_kg) values ($1, '70')",
      [user.id],
    );
    await pool.query(
      `insert into medicines (id, user_id, name, dosage)
       values ($1, $2, 'Napa', '500mg')`,
      [medicineId, user.id],
    );
    await pool.query(
      `insert into family_members (id, user_id, name, relation)
       values ($1, $2, 'Salma', 'Mother')`,
      [familyId, user.id],
    );
    await pool.query(
      `insert into reports
         (id, user_id, title, category, storage_key, mime_type, size_bytes)
       values ($1, $2, 'Blood test', 'lab', $3, 'application/pdf', 10)`,
      [reportId, user.id, `reports/${user.id}/${reportId}-test.pdf`],
    );

    r2Mocks.deleteUserObjects.mockClear();

    const res = await api()
      .delete("/auth/me")
      .set("Authorization", user.auth)
      .send({ password: DEFAULT_PASSWORD });
    expect(res.status).toBe(204);

    const { rows: gone } = await pool.query(
      "select 1 from users where id = $1",
      [user.id],
    );
    expect(gone).toHaveLength(0);

    for (const table of [
      "health_profiles",
      "medicines",
      "family_members",
      "reports",
      "refresh_tokens",
      "password_reset_tokens",
    ]) {
      const { rows } = await pool.query(
        `select 1 from ${table} where user_id = $1`,
        [user.id],
      );
      expect(rows, `${table} should be empty`).toHaveLength(0);
    }

    expect(r2Mocks.deleteUserObjects).toHaveBeenCalledTimes(1);
    expect(r2Mocks.deleteUserObjects).toHaveBeenCalledWith(user.id);
  });

  it("deletes a password-less account, which has nothing to confirm", async () => {
    const user = await createUserDirect();
    await pool.query(
      "update users set password_hash = null where id = $1",
      [user.id],
    );

    const res = await api()
      .delete("/auth/me")
      .set("Authorization", user.auth)
      .send({ password: "anything" });
    expect(res.status).toBe(204);

    const { rows } = await pool.query(
      "select 1 from users where id = $1",
      [user.id],
    );
    expect(rows).toHaveLength(0);
  });
});

describe("account deletion — afterwards", () => {
  it("blocks login, refresh and Family ID lookups", async () => {
    const user = await registerUser();

    const deleted = await api()
      .delete("/auth/me")
      .set("Authorization", user.auth)
      .send({ password: DEFAULT_PASSWORD });
    expect(deleted.status).toBe(204);

    expectApiError(
      await api()
        .post("/auth/login")
        .send({ email: user.email, password: DEFAULT_PASSWORD }),
      401,
      "Invalid email or password",
    );

    // The refresh token went with the account.
    expectApiError(
      await api()
        .post("/auth/refresh")
        .send({ refreshToken: user.refreshToken }),
      401,
    );

    expectApiError(
      await api().post("/family/connect").send({ shareId: user.shareId }),
      404,
    );
    expectApiError(await api().get(`/family/${user.shareId}`), 404);
  });

  it("answers 404 on a second delete with the old access token", async () => {
    const user = await createUserDirect();

    await api()
      .delete("/auth/me")
      .set("Authorization", user.auth)
      .send({ password: DEFAULT_PASSWORD });

    expectApiError(
      await api()
        .delete("/auth/me")
        .set("Authorization", user.auth)
        .send({ password: DEFAULT_PASSWORD }),
      404,
      "User not found",
    );
  });

  it("leaves every other account untouched", async () => {
    const deleted = await createUserDirect();
    const survivor = await createUserDirect();

    await api()
      .post("/sync")
      .set("Authorization", survivor.auth)
      .send({
        medicines: [
          {
            id: randomUUID(),
            name: "Still here",
            dosage: "1",
            times: [],
          },
        ],
      });

    await api()
      .delete("/auth/me")
      .set("Authorization", deleted.auth)
      .send({ password: DEFAULT_PASSWORD });

    const me = await api().get("/auth/me").set("Authorization", survivor.auth);
    expect(me.status).toBe(200);

    const sync = await api()
      .get("/sync")
      .set("Authorization", survivor.auth);
    expect(sync.body.medicines).toHaveLength(1);
    expect(sync.body.medicines[0].name).toBe("Still here");
  });
});
