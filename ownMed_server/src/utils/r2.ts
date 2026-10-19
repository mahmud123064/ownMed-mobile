import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "../config/env.js";
import { ApiError } from "./ApiError.js";

/**
 * Cloudflare R2 storage for uploaded reports.
 *
 * R2 speaks the S3 API, so this is the AWS SDK pointed at an R2 endpoint. The
 * bucket is private: nothing is ever served from it directly, and instead the
 * server signs short-lived URLs — a PUT for the device to upload to, a GET for
 * it to read back. That keeps the credentials on the server and means an
 * upload can't happen without an authenticated session that asked for it.
 *
 * Built lazily, like `utils/email.ts`: constructing a client with empty
 * credentials throws at module load, which would crash the server on boot
 * before `env` has been read. Deferring to first use lets the report routes
 * check `env.r2Configured` and answer with a clean 503 instead.
 */

let s3: S3Client | null = null;

function client(): S3Client {
  if (!env.r2Configured) {
    throw new ApiError(503, "Report storage is not configured");
  }
  if (!s3) {
    s3 = new S3Client({
      // R2 ignores the region but the SDK insists on one; "auto" is the value
      // Cloudflare's own docs use.
      region: "auto",
      endpoint: env.r2Endpoint,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }
  return s3;
}

/** How long an upload URL stays valid, in seconds. */
const UPLOAD_URL_TTL = 5 * 60;

/**
 * How long a download URL stays valid, in seconds.
 *
 * Long enough to open a large scan over a slow connection, short enough that a
 * URL copied out of the app goes stale rather than working forever. The app
 * asks for a fresh one every time a report is opened.
 */
const DOWNLOAD_URL_TTL = 10 * 60;

/**
 * Reduce a device file name to something safe to put in an object key.
 *
 * Object keys are a flat namespace, not paths, so a name containing "/" or
 * ".." would silently nest or traverse. Everything outside a conservative
 * allowlist becomes "-"; the display name survives in the `fileName` column,
 * so nothing user-visible depends on this being lossless.
 */
function sanitizeFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return cleaned === "" ? "file" : cleaned;
}

/**
 * The object key for a report: `reports/<userId>/<reportId>-<name>`.
 *
 * The `reports/<userId>/` prefix is load-bearing, not decorative — the create
 * route refuses any key that doesn't carry the caller's own user id, which is
 * what stops one account from attaching another account's object to its own
 * report row.
 */
export function storageKey(
  userId: string,
  reportId: string,
  fileName: string,
): string {
  return `reports/${userId}/${reportId}-${sanitizeFileName(fileName)}`;
}

/** Where a stored object's key must start to belong to `userId`. */
export function storagePrefix(userId: string): string {
  return `reports/${userId}/`;
}

/**
 * The key for a report's generated preview: `reports/<userId>/thumbs/<id>.jpg`.
 *
 * A `thumbs/` segment rather than a suffix on the file's own key, because that
 * key ends with a name the *client* chose: a report picked from a file literally
 * called "thumb.jpg" would otherwise reserve exactly the same key as its own
 * preview, and whichever upload landed second would overwrite the other. Since
 * `sanitizeFileName` strips any "/", a file's key is always one segment after the
 * user id and a preview's is always two, so the two can never meet.
 *
 * It sits under `storagePrefix`, so the same prefix check that authorizes a
 * file's key authorizes this one.
 */
export function thumbnailStorageKey(userId: string, reportId: string): string {
  return `${storagePrefix(userId)}thumbs/${reportId}.jpg`;
}

/** A presigned PUT the device can send the file bytes to. */
export function presignUpload(
  key: string,
  mimeType: string,
): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      ContentType: mimeType,
    }),
    { expiresIn: UPLOAD_URL_TTL },
  );
}

/**
 * A URL the device can read the object back from.
 *
 * A configured `R2_PUBLIC_URL` (a custom domain or CDN in front of the bucket)
 * wins when present, since those URLs are stable and cacheable; otherwise the
 * object is private and this signs a fresh GET.
 */
export function presignDownload(key: string): Promise<string> {
  if (env.r2PublicUrl) {
    return Promise.resolve(
      `${env.r2PublicUrl.replace(/\/+$/, "")}/${key}`,
    );
  }
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: env.r2Bucket, Key: key }),
    { expiresIn: DOWNLOAD_URL_TTL },
  );
}

/**
 * Best-effort removal of an object.
 *
 * Used when a report row is deleted. Failing here must not fail the request:
 * the row — the only thing that references the object — is already gone, so a
 * leftover object is invisible to the user and cheaper to leave than to turn a
 * successful delete into an error.
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    await client().send(
      new DeleteObjectCommand({ Bucket: env.r2Bucket, Key: key }),
    );
  } catch (error) {
    console.error("[r2] failed to delete object", key, error);
  }
}

/**
 * Best-effort removal of every object a user owns.
 *
 * Used when an account is deleted: the `reports` rows cascade with the user, so
 * nothing in the database still points at these objects, but leaving them in the
 * bucket would keep a deleted person's medical documents readable by whoever
 * held the key — and the key is derivable from the user id. Deleting the rows
 * first and sweeping storage afterwards keeps the account gone even if storage
 * is briefly unreachable.
 *
 * Like `deleteObject`, this never throws: account deletion must not fail because
 * storage did. An unconfigured bucket means there is nothing this API ever
 * stored for the user, so it is a no-op rather than an error.
 */
export async function deleteUserObjects(userId: string): Promise<void> {
  if (!env.r2Configured) return;

  const prefix = storagePrefix(userId);
  try {
    let continuationToken: string | undefined;
    do {
      const page = await client().send(
        new ListObjectsV2Command({
          Bucket: env.r2Bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const keys = (page.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => typeof key === "string" && key !== "");

      // One at a time: the bucket's batch API has its own size limits and
      // partial-failure semantics, and this runs once per deleted account, not
      // on any interactive path.
      for (const key of keys) {
        await deleteObject(key);
      }

      continuationToken =
        page.IsTruncated === true ? page.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
  } catch (error) {
    console.error("[r2] failed to delete objects for user", userId, error);
  }
}
