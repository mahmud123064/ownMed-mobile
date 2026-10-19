import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { env } from "../src/config/env.js";
import { pool } from "../src/db/pool.js";
import { api, createUserDirect, type TestAccount } from "./helpers.js";

/**
 * Several documents in one account.
 *
 * A single report exercises the happy path; what an account with a folder of
 * them exposes is a different set of properties — keys must stay distinct even
 * when two files share a name, listing and preview signing must cover every
 * row, and deleting one must leave the rest untouched.
 */
vi.mock("../src/utils/r2.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/r2.js")>();
  return {
    ...actual,
    deleteObject: vi.fn(async (_key: string) => {}),
    // No bytes are PUT in tests; `POST /reports` would otherwise HEAD a key
    // that does not exist and refuse the row.
    headObject: vi.fn(async (_key: string) => ({
      exists: true as const,
      sizeBytes: 2048,
    })),
  };
});

const r2Ready = env.r2Configured;

type Created = {
  id: string;
  title: string;
  storageKey: string;
  thumbnailKey: string;
};

async function createReport(
  account: TestAccount,
  options: {
    title: string;
    fileName?: string;
    mimeType?: string;
    category?: string;
    thumbnail?: boolean;
  },
): Promise<Created> {
  const id = randomUUID();
  const fileName = options.fileName ?? "scan.jpg";
  const mimeType = options.mimeType ?? "image/jpeg";

  const upload = await api()
    .post("/reports/upload-url")
    .set("Authorization", account.auth)
    .send({ id, fileName, mimeType, sizeBytes: 4096 });
  expect(upload.status).toBe(200);

  const created = await api()
    .post("/reports")
    .set("Authorization", account.auth)
    .send({
      id,
      title: options.title,
      category: options.category ?? "lab",
      takenOn: "",
      file: {
        storageKey: upload.body.storageKey,
        fileName,
        mimeType,
        sizeBytes: 4096,
        thumbnailKey: options.thumbnail === false ? "" : upload.body.thumbnailKey,
      },
    });
  expect(created.status).toBe(201);

  return {
    id,
    title: options.title,
    storageKey: upload.body.storageKey,
    thumbnailKey: upload.body.thumbnailKey,
  };
}

describe.skipIf(!r2Ready)("multiple files — key allocation", () => {
  it("gives every file its own object key", async () => {
    const user = await createUserDirect();

    const files = await Promise.all([
      createReport(user, { title: "One", fileName: "same.jpg" }),
      createReport(user, { title: "Two", fileName: "same.jpg" }),
      createReport(user, { title: "Three", fileName: "same.jpg" }),
    ]);

    const keys = new Set(files.map((file) => file.storageKey));
    const previews = new Set(files.map((file) => file.thumbnailKey));
    expect(keys.size).toBe(3);
    expect(previews.size).toBe(3);

    for (const file of files) {
      expect(file.storageKey).toBe(
        `reports/${user.id}/${file.id}-same.jpg`,
      );
      expect(file.thumbnailKey).toBe(
        `reports/${user.id}/thumbs/${file.id}.jpg`,
      );
    }
  });

  it("keeps a preview and a file apart when the file is named thumb.jpg", async () => {
    const user = await createUserDirect();
    const file = await createReport(user, {
      title: "Tricky name",
      fileName: "thumb.jpg",
    });

    // A suffix-based preview key would collide here — hence the separate
    // `thumbs/` segment.
    expect(file.storageKey).not.toBe(file.thumbnailKey);
  });
});

describe.skipIf(!r2Ready)("multiple files — listing and previews", () => {
  it("lists all of an account's reports and signs every preview", async () => {
    const user = await createUserDirect();
    const files = [
      await createReport(user, { title: "Lab", category: "lab" }),
      await createReport(user, {
        title: "X-ray",
        category: "xray",
        mimeType: "image/png",
        fileName: "xray.png",
      }),
      await createReport(user, {
        title: "Prescription",
        category: "prescription",
        mimeType: "application/pdf",
        fileName: "rx.pdf",
        thumbnail: false,
      }),
    ];

    const list = await api()
      .get("/reports")
      .set("Authorization", user.auth);
    expect(list.body.reports).toHaveLength(3);
    expect(list.body.reports.map((r: { id: string }) => r.id).sort()).toEqual(
      files.map((file) => file.id).sort(),
    );

    const previews = await api()
      .get("/reports/thumbnail-urls")
      .set("Authorization", user.auth);
    // The PDF has no preview, so it is absent rather than empty.
    expect(Object.keys(previews.body.urls).sort()).toEqual(
      [files[0]!.id, files[1]!.id].sort(),
    );
  });

  it("does not mix two accounts' files", async () => {
    const first = await createUserDirect();
    const second = await createUserDirect();

    const firstFiles = [
      await createReport(first, { title: "First A" }),
      await createReport(first, { title: "First B" }),
    ];
    const secondFile = await createReport(second, { title: "Second A" });

    const firstList = await api()
      .get("/reports")
      .set("Authorization", first.auth);
    const secondList = await api()
      .get("/reports")
      .set("Authorization", second.auth);

    expect(firstList.body.reports.map((r: { id: string }) => r.id).sort()).toEqual(
      firstFiles.map((file) => file.id).sort(),
    );
    expect(secondList.body.reports.map((r: { id: string }) => r.id)).toEqual([
      secondFile.id,
    ]);

    const firstPreviews = await api()
      .get("/reports/thumbnail-urls")
      .set("Authorization", first.auth);
    expect(Object.keys(firstPreviews.body.urls)).toHaveLength(2);
    expect(Object.keys(firstPreviews.body.urls)).not.toContain(secondFile.id);
  });
});

describe.skipIf(!r2Ready)("multiple files — deleting one at a time", () => {
  it("removes only the requested file", async () => {
    const user = await createUserDirect();
    const files = [
      await createReport(user, { title: "Keep A" }),
      await createReport(user, { title: "Delete me" }),
      await createReport(user, { title: "Keep B" }),
    ];

    const deleted = await api()
      .delete(`/reports/${files[1]!.id}`)
      .set("Authorization", user.auth);
    expect(deleted.status).toBe(204);

    const list = await api()
      .get("/reports")
      .set("Authorization", user.auth);
    expect(list.body.reports.map((r: { id: string }) => r.id).sort()).toEqual(
      [files[0]!.id, files[2]!.id].sort(),
    );

    const previews = await api()
      .get("/reports/thumbnail-urls")
      .set("Authorization", user.auth);
    expect(Object.keys(previews.body.urls).sort()).toEqual(
      [files[0]!.id, files[2]!.id].sort(),
    );
  });

  it("can empty the account, then accept a new upload again", async () => {
    const user = await createUserDirect();
    const files = [
      await createReport(user, { title: "One" }),
      await createReport(user, { title: "Two" }),
    ];

    for (const file of files) {
      expect(
        (
          await api()
            .delete(`/reports/${file.id}`)
            .set("Authorization", user.auth)
        ).status,
      ).toBe(204);
    }

    const empty = await api()
      .get("/reports")
      .set("Authorization", user.auth);
    expect(empty.body.reports).toEqual([]);

    const { rows } = await pool.query(
      "select 1 from reports where user_id = $1",
      [user.id],
    );
    expect(rows).toHaveLength(0);

    const replacement = await createReport(user, { title: "Three" });
    const list = await api()
      .get("/reports")
      .set("Authorization", user.auth);
    expect(list.body.reports.map((r: { id: string }) => r.id)).toEqual([
      replacement.id,
    ]);
  });

  it("deleting one account's file never touches another's", async () => {
    const owner = await createUserDirect();
    const stranger = await createUserDirect();
    const ownerFile = await createReport(owner, { title: "Owner's" });
    const strangerFile = await createReport(stranger, { title: "Stranger's" });

    expect(
      (
        await api()
          .delete(`/reports/${ownerFile.id}`)
          .set("Authorization", stranger.auth)
      ).status,
    ).toBe(404);

    const ownerList = await api()
      .get("/reports")
      .set("Authorization", owner.auth);
    const strangerList = await api()
      .get("/reports")
      .set("Authorization", stranger.auth);

    expect(ownerList.body.reports.map((r: { id: string }) => r.id)).toEqual([
      ownerFile.id,
    ]);
    expect(
      strangerList.body.reports.map((r: { id: string }) => r.id),
    ).toEqual([strangerFile.id]);
  });
});
