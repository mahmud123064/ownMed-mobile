import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths, UploadType } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";

import type { ReportCategory } from "@/components/dashboard/types";

import { ApiError } from "./api";

/**
 * Reports — the file half of the feature.
 *
 * A report's bytes go straight from this device to object storage using a
 * signed URL the server hands out; they never pass through the API. This module
 * owns the two device-side steps that make that work: getting a file out of the
 * OS pickers, and PUTting it to storage.
 */

/**
 * The kinds of document a report can be, in the order the form offers them.
 *
 * Mirrors the server's `categorySchema`. `value` is what is stored and sent;
 * `label` is only ever shown.
 */
export const REPORT_CATEGORIES = [
    { value: "lab", label: "Lab report" },
    { value: "prescription", label: "Prescription" },
    { value: "xray", label: "X-ray" },
    { value: "other", label: "Other" },
] as const;

export function categoryLabel(value: ReportCategory): string {
    return (
        REPORT_CATEGORIES.find((option) => option.value === value)?.label ??
        "Report"
    );
}

/**
 * The largest file the server will accept, in bytes. Kept in step with
 * `MAX_SIZE_BYTES` in `routes/reports.ts`.
 *
 * Checked here as well so an oversized file is refused before a slow upload
 * rather than after it, with a message the form can show.
 */
export const MAX_REPORT_BYTES = 25 * 1024 * 1024;

/**
 * What object storage will accept, matching the server's allowlist.
 *
 * Deliberately not a `image/*` wildcard: the mime type is signed into the
 * upload URL and stored on the row, and the app later decides how to open the
 * file from it. A type outside this list would be stored as something neither
 * side knows how to render.
 */
const MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/heic",
    "image/webp",
    "application/pdf",
] as const;

/** The extensions those types correspond to, for when a picker reports none. */
const EXTENSION_MIME: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    heic: "image/heic",
    webp: "image/webp",
    pdf: "application/pdf",
};

/**
 * Coerce whatever a picker reported into one of the accepted types.
 *
 * Both pickers are inconsistent about `mimeType`: `expo-image-picker` leaves it
 * undefined for some Android gallery items, and some devices report the
 * non-standard `image/jpg`. Since the value is signed into the upload URL and
 * must match on the way back out, it is normalized to a known-good value rather
 * than passed through — an unrecognized type falls back to the file extension,
 * and only then to a default.
 */
export function normalizeMimeType(
    reported: string | null | undefined,
    fileName: string,
): string {
    const cleaned = reported?.trim().toLowerCase() ?? "";
    // "image/jpg" is what some Android cameras report; the registered type is
    // "image/jpeg" and that is what storage expects.
    const fixed = cleaned === "image/jpg" ? "image/jpeg" : cleaned;
    if ((MIME_TYPES as readonly string[]).includes(fixed)) return fixed;

    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    return EXTENSION_MIME[extension] ?? "image/jpeg";
}

/**
 * The file's size in bytes, preferring what the picker reported.
 *
 * Both pickers leave the size out sometimes — Android's photo picker most
 * often — so it is read from the file itself when missing. `0` means the size
 * could not be established at all, which the server accepts as "unknown"
 * rather than as an empty file, so a picker that reports nothing does not block
 * the upload outright.
 */
export function resolveSize(uri: string, reported: number | undefined): number {
    if (typeof reported === "number" && reported > 0) return reported;
    try {
        return new File(uri).size;
    } catch {
        return 0;
    }
}

/** A file chosen on the device, ready to be uploaded. */
export type PickedReportFile = {
    /** A local `file://` (or `content://`) URI the upload can read from. */
    uri: string;
    /** The name to show in the list; also what the object key is derived from. */
    name: string;
    mimeType: string;
    sizeBytes: number;
};

/** What went wrong, in terms the form can show. */
export class ReportPickError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ReportPickError";
    }
}

/**
 * Open the system picker for a photo or a PDF.
 *
 * Images come from the photo library (`expo-image-picker`), which is the picker
 * a user expects for a photographed report and the only one that reliably
 * reports dimensions and a real mime type for HEIC. PDFs come from the document
 * picker, since they live in Files/Drive rather than the camera roll.
 *
 * Returns `null` when the user backs out — a cancel is not an error, and the
 * form must be able to tell the difference.
 */
export async function pickReportFile(
    kind: "image" | "pdf",
): Promise<PickedReportFile | null> {
    return kind === "image" ? pickImage() : pickPdf();
}

/**
 * Describe one asset from the photo picker as a file ready to be optimized.
 *
 * Exported because the prescription uploader picks **several** images at once,
 * which `pickReportFile` cannot express — it takes one kind of file and returns
 * one file. Sharing this is what keeps the naming and mime-type rules in one
 * place; without it the multi-select picker would grow its own copy of them, and
 * the two would drift on the first device that reports something odd.
 */
export function pickedFileFromAsset(
    asset: ImagePicker.ImagePickerAsset,
): PickedReportFile {
    // The picker often has no name for a camera-roll photo, so one is invented
    // from the mime type's extension — it is only a label, and the server
    // sanitizes it into the object key.
    const fallbackName = `photo.${extensionFor(asset.mimeType ?? "image/jpeg")}`;
    const name = asset.fileName?.trim() || fallbackName;

    return {
        uri: asset.uri,
        name,
        mimeType: normalizeMimeType(asset.mimeType, name),
        sizeBytes: resolveSize(asset.uri, asset.fileSize),
    };
}

async function pickImage(): Promise<PickedReportFile | null> {
    const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        throw new ReportPickError(
            "Photo access is needed to attach an image. Enable it in your device settings.",
        );
    }

    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        // Uncompressed, unlike the PDF path which has nothing to compress: the
        // picked bytes are the *input* to `optimizeImage`, and a picker that has
        // already thrown quality away cannot be undone by anything downstream.
        // Resizing and compression belong in exactly one place, and this is not
        // it.
        quality: 1,
        // An iPhone's camera roll is HEIC by default, and the report is viewed
        // later on whatever device the user has then — including an Android,
        // which will not decode HEIC. Asking iOS to transcode to JPEG at pick
        // time is what keeps a report readable after it has been uploaded.
        // iOS-only; Android has no equivalent and needs none.
        preferredAssetRepresentationMode:
            ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return null;

    const asset = result.assets[0];
    if (!asset) return null;

    return pickedFileFromAsset(asset);
}

async function pickPdf(): Promise<PickedReportFile | null> {
    const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        // The picker hands back a URI this app can read from; without the copy
        // it may be a security-scoped reference to another app's sandbox that
        // the upload cannot open.
        copyToCacheDirectory: true,
        multiple: false,
    });
    if (result.canceled) return null;

    const asset = result.assets[0];
    if (!asset) return null;

    const name = asset.name?.trim() || "document.pdf";

    return {
        uri: asset.uri,
        name,
        mimeType: normalizeMimeType(asset.mimeType ?? "application/pdf", name),
        sizeBytes: resolveSize(asset.uri, asset.size),
    };
}

/** The file extension for an accepted mime type, e.g. "image/png" -> "png". */
function extensionFor(mimeType: string): string {
    const entry = Object.entries(EXTENSION_MIME).find(
        ([, value]) => value === mimeType,
    );
    return entry?.[0] ?? "jpg";
}

/** Where a guest's report files live, inside the app's own sandbox. */
const LOCAL_REPORTS_DIR = "reports";

/**
 * Copy a file into the app's report directory and return its new URI.
 *
 * The directory is created idempotently so a retry (or a second report) doesn't
 * fail on it already being there, and the copy is verified before the URI is
 * handed back because everything downstream trusts it: the record is written
 * straight after this, and a report whose bytes never arrived is a row that opens
 * nothing. The copy resolving is not proof the bytes landed — a picker can report
 * a URI this API copies *nothing* from without raising (a `content://` reference
 * into another app's sandbox is the usual one) — so the destination is checked
 * instead.
 */
async function copyIntoReportsDir(
    sourceUri: string,
    baseName: string,
): Promise<string> {
    const directory = new Directory(Paths.document, LOCAL_REPORTS_DIR);
    directory.create({ intermediates: true, idempotent: true });

    const destination = new File(directory, baseName);
    // A copy, not a move: the move would take the file out of the picker's
    // cache directory, which is not ours to empty.
    await new File(sourceUri).copy(destination);

    if (!destination.exists || destination.size <= 0) {
        deleteReportFile(destination.uri);
        throw new ReportPickError(
            "That file could not be saved on this device. Try picking it again.",
        );
    }
    return destination.uri;
}

/**
 * Copy a picked file into the app's document directory and return its new URI.
 *
 * A picker hands back a URI in a cache directory (or, on Android, a
 * `content://` reference into another app's sandbox) — neither is a place a
 * report can live for months. `Paths.document` is the directory Expo documents
 * as "safe from being deleted by the system", which is exactly the lifetime a
 * guest's report needs: as long as the app is installed, and gone with it.
 *
 * The file is named after the report's id rather than its original name, so two
 * reports picked from the same photo can't collide — the name the user sees is
 * kept in the record's `fileName` instead.
 */
export async function persistReportFile(
    file: PickedReportFile,
    id: string,
): Promise<string> {
    return copyIntoReportsDir(
        file.uri,
        `${id}.${extensionFor(file.mimeType)}`,
    );
}

/**
 * Copy a generated thumbnail in beside its report, and return its new URI.
 *
 * Named after the report's id and suffixed rather than given a name of its own,
 * so the two files of one report sort together and deleting the report finds
 * both by id alone. Always `.jpg` because that is what `optimizeImage` produces.
 */
export async function persistThumbnailFile(
    uri: string,
    id: string,
): Promise<string> {
    return copyIntoReportsDir(uri, `${id}-thumb.jpg`);
}

/**
 * Whether a local report's file is still on the device.
 *
 * The document directory is not promised forever — the OS may reclaim it, and a
 * record written by an older build may point at nothing. An `exists` check is
 * cheaper than the failure it prevents: `ReportViewer` would render a broken
 * image, and the system viewer would open nothing, both with no explanation.
 */
export function localFileExists(uri: string): boolean {
    try {
        return new File(uri).exists;
    } catch {
        return false;
    }
}

/**
 * Remove a local report's file. Best-effort, and never throws.
 *
 * Mirrors the server's `deleteObject`: the record is what makes the file
 * findable, and by the time this runs the record is already gone, so a failure
 * leaves an orphaned file the user cannot see. Failing the delete over that
 * would be worse than the leak.
 */
export function deleteReportFile(uri: string): void {
    try {
        new File(uri).delete();
    } catch {
        // Already gone, or unreadable — nothing to clean up either way.
    }
}

/**
 * Hand a local file to another app, so a guest can read a PDF that has never
 * been uploaded.
 *
 * `Sharing` and not `Linking`, which cannot do this: React Native builds a bare
 * `ACTION_VIEW` — no MIME type and no `FLAG_GRANT_READ_URI_PERMISSION` — and a
 * `content://` URI handed over without that flag is one the receiving app is not
 * allowed to read, so opening a local PDF through it fails however correct the
 * URI is. `shareAsync` sets both, and is the only path that also works on iOS,
 * where a `file://` URI is unreadable by every other app by design.
 *
 * The share sheet is the point rather than a compromise: an Android chooser can
 * offer Files, Drive or a viewer, so this works even where no app has registered
 * itself as a PDF handler at all — which is the common case on an emulator.
 */
export async function openLocalFile(
    uri: string,
    mimeType: string,
): Promise<void> {
    if (!(await Sharing.isAvailableAsync())) {
        throw new ReportPickError(
            "This device cannot open files in another app.",
        );
    }

    await Sharing.shareAsync(uri, {
        mimeType,
        // iOS matches on uniform type identifiers rather than mime types.
        // "com.adobe.pdf" is the system's identifier for a PDF, which is the
        // only kind of file this is reached with — an image is rendered in-app
        // by `ReportViewer` instead.
        UTI: mimeType === "application/pdf" ? "com.adobe.pdf" : undefined,
        dialogTitle: "Open report",
    });
}

/**
 * Whether a report is an image, and so can be shown in the app.
 *
 * Anything that is not an image is treated as a PDF and handed to the system
 * viewer; the upload allowlist means those are the only two possibilities.
 */
export function isImageReport(mimeType: string): boolean {
    return mimeType.startsWith("image/");
}

/** "1.4 MB", "812 KB" — for the size shown beside a file name. */
export function formatFileSize(bytes: number): string {
    if (bytes <= 0) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * PUT a file to the signed URL from `getReportUploadUrl`.
 *
 * `mimeType` must be the same value that was sent when the URL was requested:
 * it is signed into the URL, so storage rejects the request if the `Content-Type`
 * header differs. That is also why both sides run the picker's raw value through
 * `normalizeMimeType` rather than trusting the picker.
 *
 * The upload task resolves for *any* completed HTTP response, including a
 * non-2xx one, so the status has to be checked here — a failure would otherwise
 * look like a success and the report would be created pointing at an object
 * that was never written.
 */
export async function uploadReportFile(
    uploadUrl: string,
    file: PickedReportFile,
): Promise<void> {
    if (file.sizeBytes > MAX_REPORT_BYTES) {
        throw new ReportPickError(
            `That file is ${formatFileSize(file.sizeBytes)}. The limit is ${formatFileSize(MAX_REPORT_BYTES)}.`,
        );
    }

    let result: { status: number };
    try {
        result = await new File(file.uri)
            .createUploadTask(uploadUrl, {
                httpMethod: "PUT",
                // The bytes are the whole body — no multipart framing.
                uploadType: UploadType.BINARY_CONTENT,
                mimeType: file.mimeType,
            })
            .uploadAsync();
    } catch {
        throw new ReportPickError(
            "Could not upload the file. Check your connection and try again.",
        );
    }

    if (result.status < 200 || result.status >= 300) {
        // Storage itself has no idea who this is, so a 403 here almost always
        // means the signed URL expired while the user filled the form in.
        throw new ReportPickError(
            result.status === 403
                ? "The upload link expired. Please try again."
                : `Upload failed (${result.status}).`,
        );
    }
}

/**
 * PUT a report's file and its preview, in that order.
 *
 * One helper rather than two calls at each site because the order matters and is
 * easy to get wrong: the file is what the report *is*, so it goes first and a
 * failure on it must stop everything — while the thumbnail is a convenience, and
 * a report that uploaded cleanly must not be reported as failed because its
 * preview did not. The uploader is therefore idempotent about the preview:
 * signing in later, or retrying, simply uploads it again.
 */
export async function uploadReportFiles(
    target: { uploadUrl: string; thumbnailUploadUrl: string },
    file: PickedReportFile,
    thumbnail: { uri: string; sizeBytes: number } | null,
): Promise<void> {
    await uploadReportFile(target.uploadUrl, file);

    // A PDF has no thumbnail, and an old flow (or a row whose preview failed to
    // generate) has no URL to send it to — both mean there is nothing to do.
    if (!thumbnail || target.thumbnailUploadUrl === "") return;

    try {
        await uploadReportFile(target.thumbnailUploadUrl, {
            uri: thumbnail.uri,
            name: `${file.name}-thumb.jpg`,
            mimeType: "image/jpeg",
            sizeBytes: thumbnail.sizeBytes,
        });
    } catch {
        // Deliberately swallowed: the report itself is up and reachable, and
        // failing here would strand a file that is already stored. The list
        // falls back to the category icon for a missing preview.
    }
}

/**
 * Turn anything thrown by the report flow into a line worth showing.
 *
 * A `ReportPickError` is already written for the user; an `ApiError` carries the
 * server's own message, which is the most specific thing available (an
 * unconfigured storage backend, a file over the limit). Anything else is a bug,
 * and its text would only confuse.
 */
export function reportErrorMessage(error: unknown): string {
    if (error instanceof ReportPickError || error instanceof ApiError) {
        return error.message;
    }
    return "Something went wrong. Please try again.";
}
