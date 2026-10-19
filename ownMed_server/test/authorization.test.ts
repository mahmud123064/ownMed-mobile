import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { env } from "../src/config/env.js";
import { pool } from "../src/db/pool.js";
import {
  api,
  createUserDirect,
  expectApiError,
  registerUser,
  uniqueEmail,
  uniqueIp,
} from "./helpers.js";

/**
 * Who may touch what.
 *
 * Two models live side by side: everything under `/sync` and `/reports` is
 * per-account and requires a bearer token, while `/family` is deliberately
 * unauthenticated — the share code is the credential. Both are asserted here,
 * including the boundaries between accounts on the shared routes.
 */

function sign(
  payload: Record<string, unknown>,
  options: jwt.SignOptions & { secret?: string } = {},
): string {
  const { secret = env.jwtSecret, ...rest } = options;
  return jwt.sign(payload, secret, {
    issuer: "ownmed",
    audience: "ownmed-app",
    ...rest,
  });
}

async function insertReport(userId: string, id = randomUUID()): Promise<string> {
  await pool.query(
    `insert into reports
       (id, user_id, title, category, storage_key, mime_type, size_bytes)
     values ($1, $2, 'Private', 'lab', $3, 'application/pdf', 100)`,
    [id, userId, `reports/${userId}/${id}-private.pdf`],
  );
  return id;
}

describe("authorization — bearer tokens", () => {
  it("rejects a token signed with another secret", async () => {
    const user = await createUserDirect();
    const token = sign(
      { sub: user.id, email: user.email },
      { secret: "not-the-real-secret" },
    );

    expectApiError(
      await api().get("/auth/me").set("Authorization", `Bearer ${token}`),
      401,
      "Invalid or expired token",
    );
  });

  it("rejects an expired token", async () => {
    const user = await createUserDirect();
    const token = sign(
      { sub: user.id, email: user.email },
      { expiresIn: -60 },
    );

    expectApiError(
      await api().get("/auth/me").set("Authorization", `Bearer ${token}`),
      401,
      "Invalid or expired token",
    );
  });

  it("rejects a token with the wrong issuer or audience", async () => {
    const user = await createUserDirect();

    const wrongIssuer = sign(
      { sub: user.id, email: user.email },
      { issuer: "someone-else" },
    );
    const wrongAudience = sign(
      { sub: user.id, email: user.email },
      { audience: "another-app" },
    );

    for (const token of [wrongIssuer, wrongAudience]) {
      expectApiError(
        await api().get("/auth/me").set("Authorization", `Bearer ${token}`),
        401,
      );
    }
  });

  it("rejects a signed token that carries no subject", async () => {
    const token = sign({ email: uniqueEmail() });
    expectApiError(
      await api().get("/auth/me").set("Authorization", `Bearer ${token}`),
      401,
    );
  });

  it("answers 404 when the token's account no longer exists", async () => {
    const user = await createUserDirect();
    await pool.query("delete from users where id = $1", [user.id]);

    expectApiError(
      await api().get("/auth/me").set("Authorization", user.auth),
      404,
      "User not found",
    );
  });
});

describe("authorization — per-account data", () => {
  it("keeps each account's sync snapshot separate", async () => {
    const owner = await createUserDirect();
    const stranger = await createUserDirect();

    await api()
      .post("/sync")
      .set("Authorization", owner.auth)
      .send({
        medicines: [
          {
            id: randomUUID(),
            name: "Owner only",
            dosage: "1",
            times: [],
          },
        ],
      });

    const res = await api().get("/sync").set("Authorization", stranger.auth);
    expect(res.body.medicines).toEqual([]);
  });

  it("requires a session on every /reports route", async () => {
    const id = randomUUID();

    expectApiError(await api().get("/reports"), 401);
    expectApiError(await api().post("/reports").send({}), 401);
    expectApiError(
      await api().post("/reports/upload-url").send({ id }),
      401,
    );
    expectApiError(await api().get(`/reports/${id}/download-url`), 401);
    expectApiError(await api().get("/reports/thumbnail-urls"), 401);
    expectApiError(await api().delete(`/reports/${id}`), 401);
  });

  it("hides another account's reports behind 404s", async () => {
    const owner = await createUserDirect();
    const stranger = await createUserDirect();
    const reportId = await insertReport(owner.id);

    const list = await api()
      .get("/reports")
      .set("Authorization", stranger.auth);
    expect(list.body.reports).toEqual([]);

    // 404 rather than 403: an id existing in someone else's account is not
    // information this caller should be able to learn.
    expectApiError(
      await api()
        .get(`/reports/${reportId}/download-url`)
        .set("Authorization", stranger.auth),
      404,
      "Report not found",
    );
    expectApiError(
      await api()
        .delete(`/reports/${reportId}`)
        .set("Authorization", stranger.auth),
      404,
      "Report not found",
    );

    const { rows } = await pool.query(
      "select 1 from reports where id = $1",
      [reportId],
    );
    expect(rows).toHaveLength(1);
  });

  it("refuses to attach another account's storage objects", async () => {
    const owner = await createUserDirect();
    const stranger = await createUserDirect();
    const reportId = randomUUID();
    const ownerKey = `reports/${owner.id}/${reportId}-private.pdf`;

    const foreignFile = await api()
      .post("/reports")
      .set("Authorization", stranger.auth)
      .send({
        id: reportId,
        title: "Stolen",
        category: "lab",
        takenOn: "",
        file: {
          storageKey: ownerKey,
          fileName: "private.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
        },
      });
    expectApiError(foreignFile, 400, "Invalid storage key");

    const foreignThumbnail = await api()
      .post("/reports")
      .set("Authorization", stranger.auth)
      .send({
        id: reportId,
        title: "Stolen",
        category: "lab",
        takenOn: "",
        file: {
          storageKey: `reports/${stranger.id}/${reportId}-own.pdf`,
          fileName: "own.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          thumbnailKey: `reports/${owner.id}/thumbs/${reportId}.jpg`,
        },
      });
    expectApiError(foreignThumbnail, 400, "Invalid thumbnail key");

    const { rows } = await pool.query(
      "select 1 from reports where id = $1",
      [reportId],
    );
    expect(rows).toHaveLength(0);
  });

  it("scopes profile edits to the caller", async () => {
    const first = await registerUser({ name: "First" });
    const second = await registerUser({ name: "Second" });

    await api()
      .patch("/auth/me")
      .set("Authorization", first.auth)
      .send({ name: "Renamed First" });

    const res = await api().get("/auth/me").set("Authorization", second.auth);
    expect(res.body.user.name).toBe("Second");
  });
});

describe("authorization — the Family ID model", () => {
  it("lets anyone holding the code read the domain data, without a session", async () => {
    const owner = await createUserDirect();
    await api()
      .put("/sync/health-profile")
      .set("Authorization", owner.auth)
      .send({ weightKg: "70", bloodGroup: "O+" });
    await api()
      .post("/sync")
      .set("Authorization", owner.auth)
      .send({
        medicines: [
          {
            id: randomUUID(),
            name: "Owner's medicine",
            dosage: "1",
            times: [],
          },
        ],
      });

    const connect = await api().post("/family/connect").send({
      shareId: `  ${owner.shareId.toLowerCase()} `,
    });
    expect(connect.status).toBe(200);
    expect(connect.body).toEqual({
      shareId: owner.shareId,
      name: owner.name,
    });

    const data = await api().get(`/family/${owner.shareId}`);
    expect(data.status).toBe(200);
    expect(data.body.medicines).toHaveLength(1);
    // The owner's own health profile is out of scope for this route.
    expect(data.body).not.toHaveProperty("healthProfile");
    expect(JSON.stringify(data.body)).not.toContain("weightKg");
  });

  it("lets the linked device append, but only add", async () => {
    const owner = await createUserDirect();
    const added = randomUUID();

    const res = await api()
      .post(`/family/${owner.shareId}`)
      .send({
        medicines: [
          {
            id: added,
            name: "Added by family",
            dosage: "2",
            times: ["09:00"],
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.medicines.map((m: { id: string }) => m.id)).toEqual([
      added,
    ]);
  });

  it("skips a record id already owned by a third account", async () => {
    const owner = await createUserDirect();
    const third = await createUserDirect();
    const id = randomUUID();

    await pool.query(
      `insert into medicines (id, user_id, name, dosage)
       values ($1, $2, 'Third party', '1')`,
      [id, third.id],
    );

    await api()
      .post(`/family/${owner.shareId}`)
      .send({
        medicines: [{ id, name: "Hijack attempt", dosage: "1", times: [] }],
      });

    const { rows } = await pool.query<{ name: string; user_id: string }>(
      "select name, user_id from medicines where id = $1",
      [id],
    );
    expect(rows).toEqual([{ name: "Third party", user_id: third.id }]);
  });

  it("answers 404 for an unknown code and 400 for an empty one", async () => {
    expectApiError(
      await api().post("/family/connect").send({ shareId: "ZZZZZZZZ" }),
      404,
      "No account found for that Family ID",
    );
    expectApiError(await api().get("/family/ZZZZZZZZ"), 404);
    expectApiError(
      await api().post("/family/connect").send({ shareId: "   " }),
      400,
    );
  });

  it("rate-limits Family ID lookups", async () => {
    const ip = uniqueIp();
    for (let attempt = 0; attempt < 20; attempt++) {
      const res = await api(ip)
        .post("/family/connect")
        .send({ shareId: "ZZZZZZZZ" });
      expect(res.status).toBe(404);
    }

    const blocked = await api(ip)
      .post("/family/connect")
      .send({ shareId: "ZZZZZZZZ" });
    expectApiError(blocked, 429);
    expect(blocked.body.error.message).toMatch(/Too many Family ID lookups/i);
  });
});
