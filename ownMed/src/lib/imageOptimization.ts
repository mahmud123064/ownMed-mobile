import {
    ImageManipulator,
    SaveFormat,
    type ImageResult,
} from "expo-image-manipulator";

import {
    MAX_REPORT_BYTES,
    ReportPickError,
    formatFileSize,
    resolveSize,
    type PickedReportFile,
} from "./reports";

/**
 * Image optimization — resizing, compression and thumbnails, on the device.
 *
 * Everything here runs **before** the bytes leave the phone, and that is the
 * whole reason it lives on this side: the upload goes device-to-storage through
 * a presigned URL, so an image that arrives oversized or needlessly heavy is one
 * the server would have to reject or store as-is. Doing the work here keeps that
 * design intact and needs nothing new on the server.
 *
 * The guiding rule is that a report is a **document**: the bytes in storage are
 * what a doctor may later read off the screen, so the target is set by what stays
 * legible rather than by how small a file can be squeezed — but the stored copy
 * is *always* compressed. A phone camera's original is sized for a sensor, not
 * for a screen, and the copy that lives on the server should be the copy someone
 * will actually read.
 *
 *   - Larger than the cap → scaled down to `MAX_IMAGE_EDGE`.
 *   - Within it           → kept at its own dimensions, but still re-encoded.
 *
 * Either way a readable image comes back as a fresh JPEG at `UPLOAD_JPEG_QUALITY`,
 * which turns a normal 12 MP photo from a few megabytes into a few hundred
 * kilobytes with its text intact. The one exception is an image the device cannot
 * re-encode at all: it is passed through as picked, because there is nothing to
 * gain by refusing a report over a limitation of the phone.
 *
 * A thumbnail is a *separate*, small copy made for the list, never a downgrade
 * of the file itself.
 */

/**
 * The longest edge the stored image is reduced to, in pixels.
 *
 * Chosen as the target for a document read on a phone rather than as a ceiling
 * that only enormous captures hit: 2048 px is roughly twice what a 3× screen can
 * resolve when a page is shown whole, and still enough to zoom into a printed
 * lab value. A 12 MP photo (4000×3000) is scaled to fit it; a small screenshot is
 * left at its own size.
 */
export const MAX_IMAGE_EDGE = 2048;

/**
 * The longest edge of a generated thumbnail, in pixels.
 *
 * Sized for the list row (44 px) and the prescription grid (96 px) with room for
 * a 3× screen, so the preview is never the reason a decode looks soft — while
 * still being a couple of orders of magnitude smaller than the file it stands
 * in for.
 */
export const THUMBNAIL_EDGE = 512;

/**
 * JPEG quality for the stored image.
 *
 * 0.85 with a 2048 px edge is the balance point for photographed text: artifacts
 * are not visible at reading size, values in a table stay distinct, and the file
 * is a small fraction of the camera's original. Going lower starts to soften thin
 * strokes, which is the one thing a lab report cannot afford.
 */
export const UPLOAD_JPEG_QUALITY = 0.85;

/** JPEG quality for a thumbnail. Small enough that the artifacts cannot matter. */
const THUMBNAIL_QUALITY = 0.7;

/** The quality a second, forced squeeze uses when 0.9 was not enough. */
const EMERGENCY_QUALITY = 0.5;

/**
 * An image ready to upload: the file, plus the preview made for it.
 *
 * `thumbnail` is null for a non-image (a PDF) and for an image whose dimensions
 * could not be read — there is nothing sensible to size a preview against, and a
 * row can fall back to its category icon.
 */
export type OptimizedImage = PickedReportFile & {
    /** Pixels, after any resize. 0 when the dimensions could not be read. */
    width: number;
    height: number;
    /** True when the bytes were re-encoded, so `mimeType`/`name` may differ. */
    changed: boolean;
    thumbnail: { uri: string; sizeBytes: number } | null;
};

/**
 * The image's true pixel dimensions, or null if it cannot be read.
 *
 * `renderAsync` on a fresh context decodes the image without applying any
 * transformation and without saving it, so this costs a decode but **no
 * re-encode** — the point being that measuring an image must never be the thing
 * that degrades it, and that it tells the caller whether a resize is needed
 * before any bytes are rewritten. A file this fails on is one the manipulator
 * cannot open at all, which limits what can be done with it but does not by
 * itself make it unusable.
 */
async function readDimensions(
    uri: string,
): Promise<{ width: number; height: number } | null> {
    try {
        const image = await ImageManipulator.manipulate(uri).renderAsync();
        if (image.width > 0 && image.height > 0) {
            return { width: image.width, height: image.height };
        }
        return null;
    } catch {
        return null;
    }
}

/** Scale `width`×`height` down so its longest edge is at most `maxEdge`. */
function fitWithin(
    width: number,
    height: number,
    maxEdge: number,
): { width: number; height: number } {
    const longEdge = Math.max(width, height);
    if (longEdge <= maxEdge) return { width, height };
    const scale = maxEdge / longEdge;
    return {
        // Never round to 0: a 1 px sliver is still an image, and both the
        // manipulator and the server reject a zero dimension.
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

/**
 * Re-encode an image, optionally resized, and hand back the new file.
 *
 * The output is always JPEG, including when the source was a PNG. That is a
 * deliberate trade in the paths that reach here: they only run because the image
 * was too big, and PNG is lossless — re-encoding it at any quality would leave
 * the size essentially unchanged and fail at the thing it was called to do. A
 * screenshot of a lab portal losing its alpha channel costs nothing; a report
 * that will not upload costs the user the report.
 */
async function reencode(
    uri: string,
    size: { width: number; height: number } | null,
    compress: number,
): Promise<ImageResult> {
    const context = ImageManipulator.manipulate(uri);
    if (size) context.resize(size);
    const image = await context.renderAsync();
    return image.saveAsync({ compress, format: SaveFormat.JPEG });
}

/** Give a renamed file the extension its new format actually has. */
function renameForJpeg(name: string): string {
    const base = name.replace(/\.[^./\\]+$/, "");
    // A name that was nothing but an extension ("…/.jpg") would otherwise come
    // back as the bare ".jpg" it started as.
    return `${base === "" ? "photo" : base}.jpg`;
}

/**
 * A small preview of an image already on this device, or null.
 *
 * Best-effort by design: a report without a preview is a cosmetic loss, and
 * failing the whole pick over one would turn it into a real one. Null is also
 * the honest answer when the dimensions are unknown, since a preview resized
 * against a guess is how an image ends up squashed.
 */
async function makeThumbnail(
    uri: string,
    width: number,
    height: number,
): Promise<{ uri: string; sizeBytes: number } | null> {
    if (width <= 0 || height <= 0) return null;
    try {
        const saved = await reencode(
            uri,
            fitWithin(width, height, THUMBNAIL_EDGE),
            THUMBNAIL_QUALITY,
        );
        const sizeBytes = resolveSize(saved.uri, undefined);
        if (sizeBytes <= 0) return null;
        return { uri: saved.uri, sizeBytes };
    } catch {
        return null;
    }
}

/**
 * Prepare a picked file for upload: compress it, and make its preview.
 *
 * This is the one call the pickers make, for both images and PDFs — a PDF has
 * nothing to resize and no preview to make, so it comes straight back, which
 * keeps the caller from having to branch on the kind of file it picked.
 *
 * An image is **always** re-encoded, so what comes back is not what the camera
 * wrote: it is the copy that gets stored, at `MAX_IMAGE_EDGE` and
 * `UPLOAD_JPEG_QUALITY`. Only an image the device cannot re-encode at all is
 * returned as picked.
 *
 * Throws `ReportPickError` when the image cannot be brought under the limit, so
 * the form can say what the file weighs rather than fail on the server.
 */
export async function optimizeImage(
    file: PickedReportFile,
): Promise<OptimizedImage> {
    if (!file.mimeType.startsWith("image/")) {
        return {
            ...file,
            width: 0,
            height: 0,
            changed: false,
            thumbnail: null,
        };
    }

    const original = await readDimensions(file.uri);
    const originalBytes = resolveSize(file.uri, file.sizeBytes);

    let width = original?.width ?? 0;
    let height = original?.height ?? 0;
    let uri = file.uri;
    let sizeBytes = originalBytes;
    let changed = false;

    // Every readable image is compressed. An image the device cannot even
    // measure is still worth attempting when it is heavy enough that the server
    // would refuse it — no dimensions to resize against, but compression alone
    // may bring it under.
    const worthAttempting =
        original !== null || originalBytes > MAX_REPORT_BYTES;

    if (worthAttempting) {
        const oversized =
            original !== null && Math.max(width, height) > MAX_IMAGE_EDGE;

        try {
            const saved = await reencode(
                uri,
                // Never upscaled: a small image keeps its own dimensions and is
                // re-encoded for consistency, not resampled upward.
                oversized ? fitWithin(width, height, MAX_IMAGE_EDGE) : null,
                UPLOAD_JPEG_QUALITY,
            );
            uri = saved.uri;
            width = saved.width;
            height = saved.height;
            sizeBytes = resolveSize(uri, undefined);
            changed = true;

            // One pass is not always enough: a very dense image can still be over
            // the cap once resized. A single harder squeeze, then a clear refusal
            // rather than looping.
            if (sizeBytes > MAX_REPORT_BYTES) {
                const squeezed = await reencode(uri, null, EMERGENCY_QUALITY);
                uri = squeezed.uri;
                width = squeezed.width;
                height = squeezed.height;
                sizeBytes = resolveSize(uri, undefined);
            }
        } catch {
            // Compression is the goal, not the price of admission. A file that is
            // already under the cap uploads as it was picked rather than being
            // refused over something the user cannot act on — an out-of-memory
            // decode on an enormous photo is the realistic failure here, and the
            // report is worth more than the saving. Over the cap there is no such
            // choice: the server would reject it, so the failure has to be shown.
            if (originalBytes > MAX_REPORT_BYTES) {
                throw new ReportPickError(
                    "That image could not be processed on this device. Try picking it again.",
                );
            }
            uri = file.uri;
            width = original?.width ?? 0;
            height = original?.height ?? 0;
            sizeBytes = originalBytes;
            changed = false;
        }

        if (sizeBytes > MAX_REPORT_BYTES) {
            throw new ReportPickError(
                `That image is ${formatFileSize(sizeBytes)} even after resizing. The limit is ${formatFileSize(MAX_REPORT_BYTES)}.`,
            );
        }
    }

    return {
        uri,
        // The name follows the bytes: once the file is a JPEG, a stored name
        // ending in ".heic" would describe something that is no longer there.
        name: changed ? renameForJpeg(file.name) : file.name,
        mimeType: changed ? "image/jpeg" : file.mimeType,
        sizeBytes,
        width,
        height,
        changed,
        thumbnail: await makeThumbnail(uri, width, height),
    };
}
