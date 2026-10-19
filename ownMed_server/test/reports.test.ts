import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { env } from "../src/config/env.js";
import { pool } from "../src/db/pool.js";
import {
  api,
  createUserDirect,
  expectApiError,
  type TestAccount,
} from "./helpers.js";

/**
 * Report uploads.
 *
 * The bytes never pass through Node: the API signs a PUT, the device uploads
 * straight to R2, and only then is the metadata row written. These tests cover
 * the server's half of that contract — the keys it issues, the allowlists it
 * enforces, the prefix check that stops one account attaching another's object,
 * and the download/delete surface.
 *
 * Object deletion is mocked: it would otherwise make a real R2 request for
 * every deleted row, and what this suite wants to know is that the route asks
 * for the right keys, not that the bucket is reachable.
 */
const r2Mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(async (_key: string) => {}),
  // `POST /reports` HEADs the object to confirm the upload happened. These
  // tests never PUT bytes (no bucket writes), so the check is faked as a
  // successful, in-range upload.
  // Typed like the real `headObject`, so individual tests can simulate a
  // missing object (`{ exists: false }`) or an oversized one.
  headObject: vi.fn(
    async (
      _key: string,
    ): Promise<{ exists: false } | { exists: true; sizeBytes: number }> => ({
      exists: true,
      sizeBytes: 2048,
    }),
  ),
}));
vi.mock("../src/utils/r2.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/r2.js")>();
  return {
    ...actual,
    deleteObject: r2Mocks.deleteObject,
    headObject: r2Mocks.headObject,
  };
});

const r2Ready = env.r2Configured;
const MAX_SIZE = 25 * 1024 * 1024;

function authHeader(account: TestAccount) {
  return { Authorization: account.auth };
}

async function uploadUrl(
  account: TestAccount,
  overrides: Partial<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }> = {},
) {
  const id = overrides.id ?? randomUUID();
  const res = await api()
    .post("/reports/upload-url")
    .set(authHeader(account))
    .send({
      id,
      fileName: overrides.fileName ?? "scan.jpg",
      mimeType: overrides.mimeType ?? "image/jpeg",
      sizeBytes: overrides.sizeBytes ?? 2048,
    });
  return { res, id };
}

async function createReport(
  account: TestAccount,
  overrides: Partial<{
    id: string;
    title: string;
    category: string;
    takenOn: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    thumbnailKey: string;
  }> = {},
) {
  const id = overrides.id ?? randomUUID();
  const res = await api()
    .post("/reports")
    .set(authHeader(account))
    .send({
      id,
      title: overrides.title ?? "Blood test",
      category: overrides.category ?? "lab",
      takenOn: overrides.takenOn ?? "",
      file: {
        storageKey:
          overrides.storageKey ?? `reports/${account.id}/${id}-scan.jpg`,
        fileName: overrides.fileName ?? "scan.jpg",
        mimeType: overrides.mimeType ?? "image/jpeg",
        sizeBytes: overrides.sizeBytes ?? 2048,
        thumbnailKey: overrides.thumbnailKey ?? "",
      },
    });
  return { res, id };
}

describe.skipIf(!r2Ready)("reports — upload URL issuance", () => {
  it("returns a key pair and presigned PUTs for an image", async () => {
    const user = await createUserDirect();
    const { res, id } = await uploadUrl(user, { fileName: "lab result.jpg" });

    expect(res.status).toBe(200);
    expect(res.body.storageKey).toBe(
      `reports/${user.id}/${id}-lab-result.jpg`,
    );
    expect(res.body.thumbnailKey).toBe(
      `reports/${user.id}/thumbs/${id}.jpg`,
    );

    for (const url of [res.body.uploadUrl, res.body.thumbnailUploadUrl]) {
      const parsed = new URL(url);
      expect(parsed.searchParams.get("X-Amz-Signature")).toBeTruthy();
      expect(parsed.searchParams.get("X-Amz-Expires")).toBe("300");
    }
  });

  it("signs no preview for a PDF", async () => {
    const user = await createUserDirect();
    const { res } = await uploadUrl(user, {
      fileName: "results.pdf",
      mimeType: "application/pdf",
    });

    expect(res.status).toBe(200);
    expect(res.body.thumbnailKey).toBe("");
    expect(res.body.thumbnailUploadUrl).toBe("");
    // "" rather than omitted, so the client reads one shape either way.
    expect(res.body).toHaveProperty("thumbnailKey");
  });

  it("is stable for a retried id", async () => {
    const user = await createUserDirect();
    const first = await uploadUrl(user);
    const retry = await uploadUrl(user, {
      id: first.id,
      fileName: "scan.jpg",
    });

    expect(first.res.body.storageKey).toBe(retry.res.body.storageKey);
  });

  it("keeps the file name out of the key's path structure", async () => {
    const user = await createUserDirect();
    const { res, id } = await uploadUrl(user, {
      fileName: "../../My Scan (1).jpg",
    });

    const key: string = res.body.storageKey;
    expect(key.startsWith(`reports/${user.id}/${id}-`)).toBe(true);
    // "reports", the user segment, then one flat object name — a name
    // containing "/" or ".." must not add a segment.
    expect(key.split("/")).toHaveLength(3);
    expect(key).not.toMatch(/\s/);
  });

  it("rejects unsupported MIME types", async () => {
    const user = await createUserDirect();

    for (const mimeType of [
      "image/gif",
      "text/plain",
      "application/zip",
      "application/octet-stream",
    ]) {
      const { res } = await uploadUrl(user, { mimeType });
      expectApiError(res, 400);
    }
  });

  it("enforces the size bounds, while allowing an unknown size", async () => {
    const user = await createUserDirect();

    // 0 means "the device could not determine it" — a real Android case.
    const unknown = await uploadUrl(user, { sizeBytes: 0 });
    expect(unknown.res.status).toBe(200);

    expectApiError((await uploadUrl(user, { sizeBytes: MAX_SIZE + 1 })).res, 400);
    expectApiError((await uploadUrl(user, { sizeBytes: -1 })).res, 400);
    expectApiError((await uploadUrl(user, { sizeBytes: 1.5 })).res, 400);
  });

  it("validates the id and file name", async () => {
    const user = await createUserDirect();

    expectApiError(
      (await uploadUrl(user, { id: "not-a-uuid" })).res,
      400,
    );
    expectApiError(
      (await uploadUrl(user, { fileName: "   " })).res,
      400,
    );
    expectApiError(
      (await uploadUrl(user, { fileName: "x".repeat(256) })).res,
      400,
    );
  });
});

describe.skipIf(r2Ready)("reports — unconfigured storage", () => {
  it("answers 503 until R2 is configured", async () => {
    const user = await createUserDirect();
    const { res } = await uploadUrl(user);
    expectApiError(res, 503, "Report storage is not configured");
  });
});

describe("reports — recording uploaded files", () => {
  it("creates a report row and returns the client's shape", async () => {
    const user = await createUserDirect();
    const { res, id } = await createReport(user, {
      title: "Lipid profile",
      takenOn: "2026-04-01",
    });

    expect(res.status).toBe(201);
    expect(res.body.report).toEqual({
      id,
      title: "Lipid profile",
      category: "lab",
      takenOn: "2026-04-01",
      file: {
        storageKey: `reports/${user.id}/${id}-scan.jpg`,
        fileName: "scan.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        thumbnailKey: "",
      },
    });
  });

  it("flattens an omitted date to an empty string", async () => {
    const user = await createUserDirect();
    // "" is what the client sends for "no date" and what the API returns.
    const { res } = await createReport(user);

    expect(res.body.report.takenOn).toBe("");
    const { rows } = await pool.query<{ taken_on: string | null }>(
      "select taken_on from reports where id = $1",
      [res.body.report.id],
    );
    expect(rows[0]!.taken_on).toBeNull();
  });

  it("validates the category", async () => {
    const user = await createUserDirect();
    expectApiError(
      (await createReport(user, { category: "mystery" })).res,
      400,
    );
  });

  it("stores a preview key when one is supplied", async () => {
    const user = await createUserDirect();
    const id = randomUUID();
    const thumbnailKey = `reports/${user.id}/thumbs/${id}.jpg`;

    const { res } = await createReport(user, { id, thumbnailKey });
    expect(res.status).toBe(201);
    expect(res.body.report.file.thumbnailKey).toBe(thumbnailKey);
  });

  it("refuses a row whose object was never uploaded", async () => {
    const user = await createUserDirect();
    // The upload is device-to-R2, so a row written after a failed PUT would
    // point at nothing. The HEAD is the server's only chance to notice.
    r2Mocks.headObject.mockResolvedValueOnce({ exists: false });

    const { res, id } = await createReport(user);
    expectApiError(res, 404, "Report file not found");

    const { rows } = await pool.query(
      "select 1 from reports where id = $1 and user_id = $2",
      [id, user.id],
    );
    expect(rows).toHaveLength(0);
  });

  it("refuses an object over the cap, whatever size the client claimed", async () => {
    const user = await createUserDirect();
    // `sizeBytes` in the body is only the client's claim; storage's real
    // ContentLength is what the cap is enforced against.
    r2Mocks.headObject.mockResolvedValueOnce({
      exists: true,
      sizeBytes: MAX_SIZE + 1,
    });

    const { res, id } = await createReport(user, { sizeBytes: 2048 });
    expectApiError(res, 400, "File too large");

    const { rows } = await pool.query(
      "select 1 from reports where id = $1 and user_id = $2",
      [id, user.id],
    );
    expect(rows).toHaveLength(0);
  });

  it("is idempotent for a retried create", async () => {
    const user = await createUserDirect();
    const id = randomUUID();

    const first = await createReport(user, { id, title: "Original" });
    const retry = await createReport(user, { id, title: "Ignored" });

    expect(first.res.status).toBe(201);
    expect(retry.res.status).toBe(201);
    expect(retry.res.body.report.title).toBe("Original");

    const { rows } = await pool.query(
      "select 1 from reports where id = $1 and user_id = $2",
      [id, user.id],
    );
    expect(rows).toHaveLength(1);
  });

  it("refuses to take over an id owned by another account", async () => {
    const owner = await createUserDirect();
    const stranger = await createUserDirect();
    const { id } = await createReport(owner);

    // The stranger's key is valid for the stranger, but the id is not.
    const { res } = await createReport(stranger, { id });
    expectApiError(res, 404, "Report not found");

    const { rows } = await pool.query<{ user_id: string }>(
      "select user_id from reports where id = $1",
      [id],
    );
    expect(rows).toEqual([{ user_id: owner.id }]);
  });

  it("rejects a key outside the caller's prefix", async () => {
    const owner = await createUserDirect();
    const stranger = await createUserDirect();

    expectApiError(
      (
        await createReport(stranger, {
          storageKey: `reports/${owner.id}/${randomUUID()}-x.jpg`,
        })
      ).res,
      400,
      "Invalid storage key",
    );
  });
});

describe("reports — reading and downloading", () => {
  it("lists the account's reports", async () => {
    const user = await createUserDirect();
    const first = await createReport(user, { title: "One" });
    const second = await createReport(user, {
      title: "Two",
      category: "prescription",
      mimeType: "application/pdf",
      fileName: "rx.pdf",
    });

    const res = await api()
      .get("/reports")
      .set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body.reports.map((r: { id: string }) => r.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("signs a fresh download URL, and a preview when there is one", async () => {
    const user = await createUserDirect();
    const id = randomUUID();
    const thumbnailKey = `reports/${user.id}/thumbs/${id}.jpg`;
    await createReport(user, { id, thumbnailKey });

    const res = await api()
      .get(`/reports/${id}/download-url`)
      .set(authHeader(user));

    expect(res.status).toBe(200);
    if (env.r2PublicUrl) {
      const prefix = env.r2PublicUrl.replace(/\/+$/, "");
      expect(res.body.url).toBe(
        `${prefix}/reports/${user.id}/${id}-scan.jpg`,
      );
      expect(res.body.thumbnailUrl).toBe(`${prefix}/${thumbnailKey}`);
    } else {
      expect(
        new URL(res.body.url).searchParams.get("X-Amz-Signature"),
      ).toBeTruthy();
      expect(
        new URL(res.body.thumbnailUrl).searchParams.get("X-Amz-Signature"),
      ).toBeTruthy();
    }
  });

  it("returns an empty thumbnail URL for a report without a preview", async () => {
    const user = await createUserDirect();
    const { id } = await createReport(user);

    const res = await api()
      .get(`/reports/${id}/download-url`)
      .set(authHeader(user));
    expect(res.body.thumbnailUrl).toBe("");
  });

  it("returns every preview URL in one request", async () => {
    const user = await createUserDirect();
    const withThumb = randomUUID();
    const withoutThumb = randomUUID();
    await createReport(user, {
      id: withThumb,
      thumbnailKey: `reports/${user.id}/thumbs/${withThumb}.jpg`,
    });
    await createReport(user, { id: withoutThumb });

    const res = await api()
      .get("/reports/thumbnail-urls")
      .set(authHeader(user));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.urls)).toEqual([withThumb]);
  });

  it("rejects a malformed id with 400", async () => {
    const user = await createUserDirect();
    expectApiError(
      await api()
        .get("/reports/not-a-uuid/download-url")
        .set(authHeader(user)),
      400,
    );
    expectApiError(
      await api().delete("/reports/not-a-uuid").set(authHeader(user)),
      400,
    );
  });

  it("answers 404 for an id that does not exist", async () => {
    const user = await createUserDirect();
    const id = randomUUID();

    expectApiError(
      await api()
        .get(`/reports/${id}/download-url`)
        .set(authHeader(user)),
      404,
    );
    expectApiError(
      await api().delete(`/reports/${id}`).set(authHeader(user)),
      404,
    );
  });
});

describe("reports — deletion", () => {
  it("deletes the row and asks storage for both objects", async () => {
    const user = await createUserDirect();
    const id = randomUUID();
    const thumbnailKey = `reports/${user.id}/thumbs/${id}.jpg`;
    await createReport(user, { id, thumbnailKey });
    r2Mocks.deleteObject.mockClear();

    const res = await api()
      .delete(`/reports/${id}`)
      .set(authHeader(user));
    expect(res.status).toBe(204);

    const { rows } = await pool.query(
      "select 1 from reports where id = $1",
      [id],
    );
    expect(rows).toHaveLength(0);

    expect(r2Mocks.deleteObject).toHaveBeenCalledWith(
      `reports/${user.id}/${id}-scan.jpg`,
    );
    expect(r2Mocks.deleteObject).toHaveBeenCalledWith(thumbnailKey);
    expect(r2Mocks.deleteObject).toHaveBeenCalledTimes(2);
  });

  it("deletes only the file when a row has no preview", async () => {
    const user = await createUserDirect();
    const { id } = await createReport(user);
    r2Mocks.deleteObject.mockClear();

    expect(
      (
        await api()
          .delete(`/reports/${id}`)
          .set(authHeader(user))
      ).status,
    ).toBe(204);

    expect(r2Mocks.deleteObject).toHaveBeenCalledTimes(1);
  });
});
