import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "../config/env.js";
import { db, reports, type Report } from "../db/index.js";
import { authenticate } from "../middleware/auth.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deleteObject,
  headObject,
  presignDownload,
  presignUpload,
  storageKey,
  storagePrefix,
  thumbnailStorageKey,
} from "../utils/r2.js";
import { validate } from "../utils/validate.js";
import { optionalCalendarDateSchema } from "./sync.js";

export const reportsRouter = Router();

/**
 * Uploaded medical documents.
 *
 * Separate from `/sync` because a report is not a value the device can hold and
 * merge — the bytes live in R2 and the row is only metadata about them. That
 * also makes this the one part of the API with a **delete**: medicines and
 * family members are append-only, but a document the user uploaded by mistake
 * has to be removable, and its object with it.
 *
 * Every route requires a session. A guest has no account for the report to
 * belong to and no way to get an upload URL, so the client hides the section
 * behind a sign-in prompt rather than letting these 401.
 *
 * Reports belong to the account that uploaded them. They are deliberately not
 * exposed to the Family-ID routes: managing a relative's medicines is a
 * different act from reading their lab results.
 */

export const categorySchema = z.enum([
  "lab",
  "prescription",
  "xray",
  "other",
]);

/**
 * The types the picker can produce, allowlisted rather than pattern-matched.
 *
 * The mime type is signed into the upload URL, so whatever is accepted here is
 * what the object is stored as. An open-ended check would let a client store an
 * arbitrary content type in a bucket the app later serves back.
 */
const mimeTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/pdf",
]);

// 25 MB. Phone photos are a few MB and a scanned PDF rarely more; anything past
// this is a mistake or an abuse, and it is the client's job to keep under it.
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * The file's size, where `0` means "the device could not determine it".
 *
 * Not `.positive()`: Android's photo picker sometimes reports no size at all,
 * and a zero here would reject an otherwise perfectly good upload over metadata
 * the user cannot influence. The cap above still applies to every size that
 * *was* reported, so this admits an unknown size, not an oversized one.
 */
const sizeBytesSchema = z.number().int().min(0).max(MAX_SIZE_BYTES);

const uploadUrlSchema = z.object({
  // The id the report row will carry. Sent here so the object can be named
  // after it, which makes the two retry-safe in the same way: asking for an
  // upload URL twice yields the same key, so a second attempt overwrites the
  // first object rather than leaving it orphaned in the bucket.
  id: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: mimeTypeSchema,
  sizeBytes: sizeBytesSchema,
});

const reportSchema = z.object({
  // Client-generated, so the device can name the object before the upload
  // starts and a retry lands on the same key instead of orphaning the first.
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  category: categorySchema,
  takenOn: optionalCalendarDateSchema,
  file: z.object({
    storageKey: z.string().trim().min(1).max(500),
    fileName: z.string().trim().min(1).max(255),
    mimeType: mimeTypeSchema,
    sizeBytes: sizeBytesSchema,
    // The preview the device generated, when it made one. Optional and
    // defaulting to "" rather than required, so a client that predates
    // thumbnails — or one whose preview generation failed — still creates its
    // report; a missing preview is a cosmetic loss, not a reason to refuse a
    // document the user has already uploaded.
    thumbnailKey: z.string().trim().max(500).optional().default(""),
  }),
});

const idSchema = z.string().uuid();

/** Strip the server-only columns, flattening NULLs to the client's `""`. */
function toReport(row: Report) {
  return {
    id: row.id,
    title: row.title,
    category:
      row.category === "lab" ||
      row.category === "prescription" ||
      row.category === "xray"
        ? (row.category as "lab" | "prescription" | "xray")
        : ("other" as const),
    takenOn: row.takenOn ?? "",
    file: {
      storageKey: row.storageKey,
      fileName: row.fileName ?? "",
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      thumbnailKey: row.thumbnailKey ?? "",
    },
  };
}

/**
 * Fetch a report the caller owns, or 404.
 *
 * The 404 rather than a 403 is deliberate: whether an id exists in someone
 * else's account is not something an authenticated caller should be able to
 * learn from this endpoint.
 */
async function ownedReport(userId: string, id: string): Promise<Report> {
  const rows = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, id), eq(reports.userId, userId)))
    .limit(1);

  const report = rows[0];
  if (!report) throw ApiError.notFound("Report not found");
  return report;
}

/**
 * Reserve an object key and hand back a URL to PUT the bytes to.
 *
 * Split from `POST /reports` because the upload happens device-to-R2, not
 * through this server: the file never touches Node, which is the whole point of
 * presigning. The row is written afterwards, in `POST /reports`, once the
 * upload has actually succeeded.
 */
reportsRouter.post(
  "/upload-url",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!env.r2Configured) {
      throw new ApiError(503, "Report storage is not configured");
    }

    const userId = req.user!.id;
    const input = validate(uploadUrlSchema, req.body);
    const key = storageKey(userId, input.id, input.fileName);

    // A preview is only signed for an image. The device generates it — the
    // server never looks at the pixels — and a PDF has none to generate, so
    // handing out a URL for one would only add a second way for the upload to
    // half-fail.
    const thumbnailKey = input.mimeType.startsWith("image/")
      ? thumbnailStorageKey(userId, input.id)
      : null;

    res.json({
      storageKey: key,
      uploadUrl: await presignUpload(key, input.mimeType),
      // "" rather than omitted, so the client reads one shape either way.
      thumbnailKey: thumbnailKey ?? "",
      thumbnailUploadUrl: thumbnailKey
        ? await presignUpload(thumbnailKey, "image/jpeg")
        : "",
    });
  }),
);

/**
 * Record a report whose bytes have already been uploaded.
 *
 * The body carries the `storageKey` from `/upload-url`, so this is where a
 * client could try to attach someone else's object to its own row. The prefix
 * check is what prevents it: a key is only accepted if it sits under the
 * caller's own `reports/<userId>/` segment.
 */
reportsRouter.post(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const input = validate(reportSchema, req.body);

    if (!input.file.storageKey.startsWith(storagePrefix(userId))) {
      throw ApiError.badRequest("Invalid storage key");
    }

    // A thumbnail key is client-supplied in exactly the same way, and is
    // checked the same way. `thumbnailStorageKey` puts it under the same prefix,
    // so one rule covers both.
    const thumbnailKey = input.file.thumbnailKey;
    if (thumbnailKey !== "" && !thumbnailKey.startsWith(storagePrefix(userId))) {
      throw ApiError.badRequest("Invalid thumbnail key");
    }

    // Confirm the bytes are actually in storage before a row claims they are.
    // The upload happened device-to-R2, so this HEAD is the server's only view
    // of it — and its `ContentLength` is the real size, where `sizeBytes` in
    // the body is the client's claim. The preview is left best-effort: a
    // missing one already renders as a category icon and costs nothing.
    if (!env.r2Configured) {
      throw new ApiError(503, "Report storage is not configured");
    }

    const stored = await headObject(input.file.storageKey);
    if (!stored.exists) {
      throw ApiError.notFound("Report file not found");
    }
    if (stored.sizeBytes > MAX_SIZE_BYTES) {
      throw ApiError.badRequest("File too large");
    }

    const rows = await db
      .insert(reports)
      .values({
        id: input.id,
        userId,
        title: input.title,
        category: input.category,
        // An empty date means "not recorded", which is what NULL is for.
        takenOn: input.takenOn || null,
        fileName: input.file.fileName,
        storageKey: input.file.storageKey,
        thumbnailKey: thumbnailKey || null,
        mimeType: input.file.mimeType,
        sizeBytes: input.file.sizeBytes,
      })
      // The id is client-generated, so a retry after a dropped response must
      // not fail the request — the row it is trying to create already exists.
      // `onConflictDoNothing` then leaves the insert empty, and the select
      // below returns the row either way.
      .onConflictDoNothing()
      .returning();

    const report = rows[0] ?? (await ownedReport(userId, input.id));
    res.status(201).json({ report: toReport(report) });
  }),
);

/**
 * The account's reports, newest first.
 *
 * Ordered by `createdAt` rather than `takenOn`: the list is a record of what
 * was uploaded, and a report with no date has to sort somewhere sensible.
 */
reportsRouter.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(reports)
      .where(eq(reports.userId, req.user!.id))
      .orderBy(desc(reports.createdAt));

    res.json({ reports: rows.map(toReport) });
  }),
);

/**
 * A fresh URL to read one report back from.
 *
 * Signed on demand rather than stored, so the URL in the response is always
 * live and expires on its own — the list endpoint deliberately returns no URL
 * at all, since one embedded there would be stale by the time it was used.
 *
 * The preview is signed in the same response, because it is wanted at the same
 * moment and by the same caller: a screen that is about to show the report.
 */
reportsRouter.get(
  "/:id/download-url",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const report = await ownedReport(req.user!.id, id);

    res.json({
      url: await presignDownload(report.storageKey),
      thumbnailUrl: report.thumbnailKey
        ? await presignDownload(report.thumbnailKey)
        : "",
    });
  }),
);

/**
 * Preview URLs for every report that has one, keyed by report id.
 *
 * A separate endpoint rather than a field on `GET /reports` because these URLs
 * expire: embedding them in the list would mean the list itself went stale ten
 * minutes after it was read. Kept apart, the list stays a record of what exists
 * and this is fetched alongside it, so a failed or slow preview never holds up
 * the reports themselves.
 *
 * One request for the whole account rather than one per row, since the list
 * renders them all at once and a signed URL costs a signature each.
 */
reportsRouter.get(
  "/thumbnail-urls",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!env.r2Configured) {
      // No storage means no previews to sign. Not an error: the list is still
      // perfectly usable with its category icons, and a 503 here would put an
      // error on a screen that has nothing wrong with it.
      res.json({ urls: {} });
      return;
    }

    const rows = await db
      .select({ id: reports.id, thumbnailKey: reports.thumbnailKey })
      .from(reports)
      .where(eq(reports.userId, req.user!.id));

    const entries = await Promise.all(
      rows
        .filter((row) => row.thumbnailKey !== null)
        .map(
          async (row) =>
            [row.id, await presignDownload(row.thumbnailKey!)] as const,
        ),
    );

    res.json({ urls: Object.fromEntries(entries) });
  }),
);

/**
 * Remove a report and its object.
 *
 * The row goes first and the object after, best-effort: the row is what makes
 * the object reachable, so once it is gone a failed delete leaves nothing the
 * user can see. Doing it the other way round risks a row pointing at an object
 * that no longer exists, which would surface as a broken image.
 */
reportsRouter.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const report = await ownedReport(req.user!.id, id);

    await db.delete(reports).where(eq(reports.id, report.id));
    await deleteObject(report.storageKey);
    // Its preview goes with it — best-effort like the file, and only when there
    // is one. A row deleted before this column existed has none.
    if (report.thumbnailKey) await deleteObject(report.thumbnailKey);

    res.status(204).end();
  }),
);
