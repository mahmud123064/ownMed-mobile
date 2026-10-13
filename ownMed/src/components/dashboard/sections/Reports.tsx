import { useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import {
    FileImage,
    FileText,
    Image as ImageIcon,
    LogIn,
    ScanLine,
    Trash2,
    Upload,
    type LucideIcon,
} from "lucide-react-native";

import DateField from "@/components/ui/DateField";
import FormField from "@/components/ui/FormField";
import type {
    LocalReport,
    Report,
    ReportCategory,
} from "@/components/dashboard/types";
import { useAppData } from "@/context/AppDataContext";
import { api } from "@/lib/api";
import { optimizeImage, type OptimizedImage } from "@/lib/imageOptimization";
import { formatDate, todayISO } from "@/lib/medicineSchedule";
import {
    MAX_REPORT_BYTES,
    REPORT_CATEGORIES,
    categoryLabel,
    formatFileSize,
    isImageReport,
    localFileExists,
    openLocalFile,
    pickReportFile,
    reportErrorMessage,
    uploadReportFiles,
} from "@/lib/reports";
import { brand, status, useAppTheme } from "@/theme";

import ReportViewer from "./ReportViewer";

/** An icon per category, so the list is scannable without reading labels. */
const CATEGORY_ICONS: Record<ReportCategory, LucideIcon> = {
    lab: FileText,
    prescription: ScanLine,
    xray: ImageIcon,
    other: FileImage,
};

/**
 * One row of the list, whichever side it came from.
 *
 * A report on the server and one still on the device differ only in where the
 * bytes live, so both are flattened to this before rendering: the difference
 * survives as the single `local` flag, rather than as two lists with two copies
 * of the row and two chances for them to drift apart.
 */
type ReportRow = {
    id: string;
    title: string;
    category: ReportCategory;
    takenOn: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    /**
     * A local path or a signed URL for a small preview, or "" when there is
     * none. Empty is a normal state, not a failure: a PDF has no preview, a
     * record written before previews existed has none, and a report whose
     * preview is still being signed has none *yet*.
     */
    thumbnail: string;
    /** True when the file is only on this device — not yet uploaded. */
    local: boolean;
};

function toRow(
    report: Report | LocalReport,
    local: boolean,
    thumbnail: string,
): ReportRow {
    return {
        id: report.id,
        title: report.title,
        category: report.category,
        takenOn: report.takenOn,
        fileName: report.file.fileName,
        mimeType: report.file.mimeType,
        sizeBytes: report.file.sizeBytes,
        thumbnail,
        local,
    };
}

/**
 * A local report's preview, or "" when it is not usable.
 *
 * The document directory is not promised forever, so a record can outlive the
 * preview written beside it. Checking before rendering is what keeps a reclaimed
 * file from becoming a broken image with no explanation — the row simply falls
 * back to its category icon, which is the same thing a PDF shows.
 */
function localPreview(report: LocalReport): string {
    const uri = report.file.thumbnailUri;
    return uri !== "" && localFileExists(uri) ? uri : "";
}

/**
 * Add a report, and browse the ones already added.
 *
 * A signed-in user's reports live on the server: the bytes are in object storage
 * and the rows are read fresh each time the section opens. A guest has no
 * account for a report to belong to — so the file is copied into app storage and
 * the record kept on the device, which is the same local-first bargain medicines
 * already make. Those local reports are uploaded to the account on sign-in (see
 * `flushPendingReports`), which is what makes them outlive a reinstall.
 *
 * The two paths share one form and one list; only where the bytes go differs.
 */
export default function Reports() {
    const { colors } = useAppTheme();
    const {
        hydrated,
        authUser,
        localReports,
        addLocalReport,
        deleteLocalReport,
    } = useAppData();

    const [reports, setReports] = useState<Report[]>([]);
    /**
     * Signed preview URLs for the account's reports, by id.
     *
     * Fetched beside the list rather than with it, and held here rather than on
     * each row: the URLs are signed for the whole account in one request, and a
     * row that has none simply has no entry.
     *
     * Tagged with the `fetchKey` that produced it, like `loaded` above, so the
     * URLs of a session that has ended stop being read the moment the key moves
     * — no effect has to clear them, and signing back in as someone else cannot
     * briefly show the previous account's previews.
     */
    const [thumbnails, setThumbnails] = useState<{
        key: string;
        urls: Record<string, string>;
    }>({ key: "", urls: {} });
    const [loadError, setLoadError] = useState("");
    /**
     * Bumped to re-read the list. A counter rather than a callback because the
     * fetch belongs in the effect below — keeping one code path for "what is on
     * screen" is what stops a post-write list from drifting from the server's.
     */
    const [reloadToken, setReloadToken] = useState(0);

    const [title, setTitle] = useState("");
    const [category, setCategory] = useState<ReportCategory>("lab");
    const [takenOn, setTakenOn] = useState(todayISO());
    const [file, setFile] = useState<OptimizedImage | null>(null);
    const [picking, setPicking] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    /** The image being shown, plus the URL it was loaded from. */
    const [viewing, setViewing] = useState<{
        title: string;
        url: string;
    } | null>(null);
    /** The report whose file is being opened, if any. */
    const [openingId, setOpeningId] = useState<string | null>(null);

    const signedIn = authUser !== null;

    /**
     * `<account id>:<reload token>` of the fetch that last finished.
     *
     * The spinner is derived from this rather than set outright: bumping
     * `reloadToken`, or signing in, changes the key and leaves `loaded` behind,
     * so the list counts as loading until the matching response lands. A
     * boolean would have to be reset synchronously on every run that does not
     * fetch — a guest's — which is a cascading render for a value that already
     * follows from these two. Folding the account id in is what stops a
     * sign-out and back in from reading as "already loaded" and flashing the
     * previous account's list.
     */
    const [loaded, setLoaded] = useState("");
    const fetchKey = `${authUser?.id ?? ""}:${reloadToken}`;
    const loading = signedIn && loaded !== fetchKey;

    /**
     * Ask for the list again — after an upload, a delete, or a failed load.
     *
     * Only the token moves; the spinner follows it on its own, so a reload
     * looks the same regardless of what caused it.
     */
    const refresh = () => {
        setReloadToken((token) => token + 1);
    };

    /**
     * Load the account's reports.
     *
     * Runs on mount and again after every write, so the list on screen is what
     * the server actually stored rather than a local guess at it. A guest has
     * no server list at all — theirs comes from `localReports` in context, which
     * hydration has already filled — so there is nothing to fetch, and nothing
     * to mark loaded either: `loading` is false for them on its own.
     */
    useEffect(() => {
        // Nothing to fetch for a guest: their rows come from `localReports` in
        // context, which hydration has already filled, and `loading` is false
        // for them by definition.
        if (!hydrated) return;
        // A guest has nothing to fetch and nothing to clear: their rows come
        // from `localReports` in context, and any URLs still held belong to a
        // `fetchKey` that no longer matches, so they are already unreadable.
        if (!signedIn) return;
        let cancelled = false;

        (async () => {
            try {
                const { reports: fetched } = await api.listReports();
                if (cancelled) return;
                setReports(fetched);
                setLoadError("");
            } catch (error) {
                if (cancelled) return;
                setLoadError(reportErrorMessage(error));
            } finally {
                // Skipped when this run was superseded: the newer run owns the
                // key the spinner is waiting on, and marking this one done
                // would drop the spinner out from under a fetch still going.
                if (!cancelled) setLoaded(fetchKey);
            }

            // Deliberately after the list, and separate from it: the previews
            // are an enhancement, so a failed or slow signing pass must not
            // decide whether the reports themselves appear, and must not hold up
            // the spinner that says they are loading.
            try {
                const { urls } = await api.getReportThumbnailUrls();
                if (!cancelled) setThumbnails({ key: fetchKey, urls });
            } catch {
                // A failed signing pass is not an error worth showing: the rows
                // are all still there and still openable, just without previews.
                if (!cancelled) setThumbnails({ key: fetchKey, urls: {} });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [hydrated, signedIn, fetchKey]);

    /**
     * Pick a file, optimize it, and refuse one the server will not take.
     *
     * The size cap is enforced here rather than only on submit so an oversized
     * file is rejected while the user is still on the picker, instead of after
     * they have filled the rest of the form in.
     *
     * Which size that check runs against differs by kind, and the difference
     * matters: a PDF has nothing to optimize, so it is judged as picked, while
     * an image is judged *after* `optimizeImage` — refusing a large photo up
     * front would turn away exactly the files the pipeline exists to make
     * acceptable. `optimizeImage` enforces the cap on what it produces, so an
     * image that cannot be brought under is still rejected, just with a message
     * about the result rather than the original.
     */
    const onPick = async (kind: "image" | "pdf") => {
        setFormError("");
        setPicking(true);
        try {
            const picked = await pickReportFile(kind);
            if (!picked) return;

            if (
                !isImageReport(picked.mimeType) &&
                picked.sizeBytes > MAX_REPORT_BYTES
            ) {
                setFormError(
                    `That file is ${formatFileSize(picked.sizeBytes)}. The limit is ${formatFileSize(MAX_REPORT_BYTES)}.`,
                );
                return;
            }

            // Resized, compressed and previewed before the form is finished, so
            // the size shown below is the size that will actually be uploaded —
            // a number the user can trust rather than the picker's.
            setFile(await optimizeImage(picked));
        } catch (error) {
            setFormError(reportErrorMessage(error));
        } finally {
            setPicking(false);
        }
    };

    const resetForm = () => {
        setTitle("");
        setCategory("lab");
        setTakenOn(todayISO());
        setFile(null);
    };

    /**
     * Save or upload, depending on whether there is an account to upload to.
     *
     * The signed-in path is three steps, in this order for a reason: the id is
     * minted first so the object key and the row can share it, the bytes go up
     * before the row exists so a failure leaves nothing pointing at a missing
     * object, and the list is re-read from the server rather than patched
     * locally so what is on screen is what was actually stored.
     *
     * The guest path is one step: copy the file into app storage and keep the
     * record. There is no list to re-read because the row is in context, which
     * re-renders on its own.
     */
    const onSubmit = async () => {
        const trimmed = title.trim();
        if (trimmed === "") {
            setFormError("Give the report a title.");
            return;
        }
        if (!file) {
            setFormError("Attach a photo or a PDF.");
            return;
        }

        setFormError("");
        setSubmitting(true);
        try {
            if (!signedIn) {
                await addLocalReport({
                    title: trimmed,
                    category,
                    takenOn,
                    file,
                });
                resetForm();
                return;
            }

            const id = Crypto.randomUUID();

            const target = await api.getReportUploadUrl({
                id,
                fileName: file.name,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
            });

            // The preview rides along with the file, into the second key the
            // same response reserved. A PDF and an image whose preview could not
            // be generated both come back with no upload URL, and the helper
            // treats that as "nothing to send" rather than an error.
            await uploadReportFiles(target, file, file.thumbnail);

            await api.createReport({
                id,
                title: trimmed,
                category,
                takenOn,
                file: {
                    storageKey: target.storageKey,
                    fileName: file.name,
                    mimeType: file.mimeType,
                    sizeBytes: file.sizeBytes,
                    thumbnailKey: target.thumbnailKey,
                },
            });

            resetForm();
            refresh();
        } catch (error) {
            setFormError(reportErrorMessage(error));
        } finally {
            setSubmitting(false);
        }
    };

    /**
     * Open a report: images in the app, PDFs in whatever the device uses.
     *
     * A local report needs no round trip — the bytes are already on this device,
     * and there is nothing to sign — so an image opens straight from its
     * `file://` URI and a PDF goes to the share sheet. A server report needs a
     * fresh signed URL instead, which is why that path is a round trip and why
     * the button shows a spinner; its PDF is a plain https URL, so `Linking` can
     * hand it to the browser, which is a better PDF view than anything this
     * screen would do. Neither PDF is rendered in-app: there is no PDF renderer
     * here, and `react-native-pdf` is the upgrade path if one is ever wanted.
     */
    const onOpen = async (row: ReportRow) => {
        setOpeningId(row.id);
        try {
            if (row.local) {
                const local = localReports.find((entry) => entry.id === row.id);
                if (!local) return;
                // Said plainly rather than left to the viewer: a record whose
                // file is gone is not a report, and the row can be deleted from
                // the list this message appears over.
                if (!localFileExists(local.file.uri)) {
                    Alert.alert(
                        "File is not on this device",
                        `"${row.title}" is listed, but its file is no longer in this app's storage. Delete the report to remove the entry.`,
                    );
                    return;
                }
                if (isImageReport(row.mimeType)) {
                    setViewing({ title: row.title, url: local.file.uri });
                } else {
                    await openLocalFile(local.file.uri, row.mimeType);
                }
                return;
            }

            const { url } = await api.getReportDownloadUrl(row.id);
            if (isImageReport(row.mimeType)) {
                setViewing({ title: row.title, url });
            } else {
                await Linking.openURL(url);
            }
        } catch (error) {
            Alert.alert("Could not open report", reportErrorMessage(error));
        } finally {
            setOpeningId(null);
        }
    };

    const onDelete = (row: ReportRow) => {
        Alert.alert(
            "Delete report?",
            row.local
                ? `"${row.title}" and its file will be removed from this device. This cannot be undone.`
                : `"${row.title}" and its file will be removed. This cannot be undone.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                        void (async () => {
                            try {
                                // A local report is deleted here and nowhere
                                // else; there is no server row to remove. The
                                // list re-renders from context on its own.
                                if (row.local) {
                                    await deleteLocalReport(row.id);
                                    return;
                                }
                                await api.deleteReport(row.id);
                                refresh();
                            } catch (error) {
                                Alert.alert(
                                    "Could not delete report",
                                    reportErrorMessage(error),
                                );
                            }
                        })();
                    },
                },
            ],
        );
    };

    // A remembered session, and a guest's own reports, are read back from
    // storage a moment after mount. Rendering before that would show "No
    // reports yet" — and the guest note — to someone who has both.
    if (!hydrated) return null;

    /**
     * Local reports first, then the account's.
     *
     * They normally only coexist for a signed-in user whose upload is still
     * owed — `flushPendingReports` clears them on the way in — and when they do,
     * the device's copy is the one at risk, so it goes on top where it is seen.
     */
    const rows = signedIn
        ? [
              ...localReports.map((report) =>
                  toRow(report, true, localPreview(report)),
              ),
              ...reports.map((report) =>
                  toRow(
                      report,
                      false,
                      // Read only from the fetch that is current: a URL left
                      // over from a previous session is not this row's.
                      thumbnails.key === fetchKey
                          ? thumbnails.urls[report.id] ?? ""
                          : "",
                  ),
              ),
          ]
        : localReports.map((report) =>
              toRow(report, true, localPreview(report)),
          );

    const pendingCount = signedIn ? localReports.length : 0;

    return (
        <>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 32 }}
                className="flex-1"
            >
                <View className="px-6 pt-6">
                    <Text className="text-2xl font-display-bold text-foreground">
                        Reports
                    </Text>
                    <Text className="mt-1 text-sm font-sans text-muted">
                        Upload a lab result, scan or prescription, and open it
                        again whenever you need it.
                    </Text>

                    {/* Guest data policy, at the point it matters: what happens
                        to a report added without an account. */}
                    {!signedIn && (
                        <Pressable
                            onPress={() => router.navigate("/sign-up")}
                            className="mt-5 flex-row items-center gap-3 rounded-3xl border border-brand-600/30 bg-brand-600/10 px-4 py-3"
                        >
                            <LogIn
                                color={brand[600]}
                                size={18}
                                strokeWidth={2}
                            />
                            <Text className="flex-1 text-xs leading-relaxed font-sans text-foreground">
                                Reports you add are kept on this device only —
                                reinstalling the app removes them. Create an
                                account and they are copied to it.
                            </Text>
                        </Pressable>
                    )}

                    {/* Upload form */}
                    <View className="mt-5 gap-4 rounded-3xl border border-border bg-surface p-4">
                        <Text className="text-base font-semibold text-foreground">
                            New report
                        </Text>

                        <FormField
                            label="Title"
                            icon={FileText}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="e.g. Blood test — September"
                            maxLength={200}
                        />

                        <View className="gap-2">
                            <Text className="text-sm font-medium text-foreground">
                                Category
                            </Text>
                            <View className="flex-row flex-wrap gap-2">
                                {REPORT_CATEGORIES.map((option) => {
                                    const active = category === option.value;
                                    return (
                                        <Pressable
                                            key={option.value}
                                            onPress={() =>
                                                setCategory(option.value)
                                            }
                                            className={[
                                                "rounded-2xl border px-4 py-2",
                                                active
                                                    ? "border-brand-600 bg-brand-600/10"
                                                    : "border-border bg-surface",
                                            ].join(" ")}
                                        >
                                            <Text
                                                className={[
                                                    "text-sm font-semibold",
                                                    active
                                                        ? "text-brand-700"
                                                        : "text-muted",
                                                ].join(" ")}
                                            >
                                                {option.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </View>

                        <DateField
                            label="Report date"
                            value={takenOn}
                            onChange={setTakenOn}
                            // A report is dated in the past; a future one is a
                            // typo, and the calendar should not offer it.
                            maximumDate={new Date()}
                        />

                        <View className="gap-2">
                            <Text className="text-sm font-medium text-foreground">
                                File
                            </Text>
                            {file ? (
                                <View className="flex-row items-center gap-3 rounded-2xl border border-brand-600/30 bg-brand-600/10 px-4 py-3">
                                    <FileImage
                                        color={brand[600]}
                                        size={18}
                                        strokeWidth={2}
                                    />
                                    <View className="flex-1">
                                        <Text
                                            numberOfLines={1}
                                            className="text-sm font-semibold text-foreground"
                                        >
                                            {file.name}
                                        </Text>
                                        <Text className="mt-0.5 text-xs font-sans text-muted">
                                            {formatFileSize(file.sizeBytes)}
                                        </Text>
                                    </View>
                                    <Pressable
                                        onPress={() => setFile(null)}
                                        hitSlop={8}
                                    >
                                        <Text className="text-xs font-semibold text-muted">
                                            Remove
                                        </Text>
                                    </Pressable>
                                </View>
                            ) : (
                                <View className="flex-row gap-2">
                                    <Pressable
                                        onPress={() => void onPick("image")}
                                        disabled={picking}
                                        className={[
                                            "flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3",
                                            picking ? "opacity-50" : "",
                                        ].join(" ")}
                                    >
                                        <ImageIcon
                                            color={colors.muted}
                                            size={16}
                                            strokeWidth={2}
                                        />
                                        <Text className="text-sm font-semibold text-foreground">
                                            Photo
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={() => void onPick("pdf")}
                                        disabled={picking}
                                        className={[
                                            "flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3",
                                            picking ? "opacity-50" : "",
                                        ].join(" ")}
                                    >
                                        <FileText
                                            color={colors.muted}
                                            size={16}
                                            strokeWidth={2}
                                        />
                                        <Text className="text-sm font-semibold text-foreground">
                                            PDF
                                        </Text>
                                    </Pressable>
                                </View>
                            )}
                        </View>

                        {formError !== "" && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {formError}
                            </Text>
                        )}

                        <Pressable
                            onPress={() => void onSubmit()}
                            disabled={submitting}
                            className={[
                                "flex-row items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4",
                                submitting ? "opacity-60" : "",
                            ].join(" ")}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#ffffff" size="small" />
                            ) : (
                                <Upload
                                    color="#ffffff"
                                    size={18}
                                    strokeWidth={2.5}
                                />
                            )}
                            <Text className="text-base font-semibold text-white">
                                {submitting
                                    ? signedIn
                                        ? "Uploading…"
                                        : "Saving…"
                                    : signedIn
                                      ? "Upload report"
                                      : "Save report"}
                            </Text>
                        </Pressable>
                    </View>

                    {/* The reports already added — on the account, on this
                        device, or both. */}
                    <View className="mt-8 flex-row items-center justify-between">
                        <Text className="text-lg font-semibold text-foreground">
                            {signedIn ? "Previous reports" : "Your reports"}
                        </Text>
                        {loading && reports.length > 0 ? (
                            <ActivityIndicator color={brand[600]} size="small" />
                        ) : null}
                    </View>

                    {/* Only non-empty when an upload is still owed — the
                        sign-in flush uploads everything it can reach. */}
                    {pendingCount > 0 && (
                        <Text className="mt-2 text-xs font-sans text-muted">
                            {pendingCount === 1
                                ? "1 report on this device has not been uploaded yet."
                                : `${pendingCount} reports on this device have not been uploaded yet.`}
                        </Text>
                    )}

                    {loadError !== "" ? (
                        <View className="mt-3 gap-3 rounded-3xl border border-border bg-surface p-4">
                            <Text
                                style={{ color: status.danger }}
                                className="text-sm font-sans"
                            >
                                {loadError}
                            </Text>
                            <Pressable
                                onPress={() => void refresh()}
                                className="self-start rounded-2xl border border-border px-4 py-2"
                            >
                                <Text className="text-sm font-semibold text-foreground">
                                    Try again
                                </Text>
                            </Pressable>
                        </View>
                    ) : loading && rows.length === 0 ? (
                        <View className="py-8">
                            <ActivityIndicator color={brand[600]} />
                        </View>
                    ) : rows.length === 0 ? (
                        <Text className="py-6 text-center text-sm font-sans text-muted">
                            {signedIn
                                ? "No reports yet. Upload one above and it will show up here."
                                : "No reports yet. Add one above and it will be kept on this device."}
                        </Text>
                    ) : (
                        <View className="mt-3 gap-3">
                            {rows.map((row) => {
                                const Icon = CATEGORY_ICONS[row.category];
                                const opening = openingId === row.id;
                                return (
                                    <View
                                        key={row.id}
                                        className="flex-row items-center gap-3 rounded-3xl border border-border bg-surface p-4"
                                    >
                                        {/* The preview, when there is one, in
                                            place of the category icon — a
                                            thumbnail of the actual document
                                            tells the user which report this is
                                            far faster than an icon that every
                                            report of the category shares. */}
                                        <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-brand-600/10">
                                            {row.thumbnail !== "" ? (
                                                <Image
                                                    source={{
                                                        uri: row.thumbnail,
                                                    }}
                                                    className="h-full w-full"
                                                    resizeMode="cover"
                                                />
                                            ) : (
                                                <Icon
                                                    color={brand[600]}
                                                    size={22}
                                                    strokeWidth={2}
                                                />
                                            )}
                                        </View>
                                        <View className="flex-1">
                                            <Text
                                                numberOfLines={1}
                                                className="text-sm font-semibold text-foreground"
                                            >
                                                {row.title}
                                            </Text>
                                            <Text className="mt-0.5 text-xs font-sans text-muted">
                                                {categoryLabel(row.category)}
                                                {/* A report with no date is a
                                                    real state, not a gap to
                                                    paper over with today. */}
                                                {row.takenOn !== ""
                                                    ? ` · ${formatDate(row.takenOn)}`
                                                    : " · No date"}
                                            </Text>
                                            <Text
                                                numberOfLines={1}
                                                className="mt-1 text-xs font-sans text-muted"
                                            >
                                                {row.fileName} ·{" "}
                                                {formatFileSize(row.sizeBytes)}
                                            </Text>
                                        </View>
                                        <Pressable
                                            onPress={() => void onOpen(row)}
                                            disabled={opening}
                                            hitSlop={6}
                                            className="rounded-2xl border border-border px-3 py-2"
                                        >
                                            {opening ? (
                                                <ActivityIndicator
                                                    color={colors.muted}
                                                    size="small"
                                                />
                                            ) : (
                                                <Text className="text-xs font-semibold text-foreground">
                                                    View
                                                </Text>
                                            )}
                                        </Pressable>
                                        <Pressable
                                            onPress={() => onDelete(row)}
                                            hitSlop={8}
                                        >
                                            <Trash2
                                                color={colors.muted}
                                                size={18}
                                                strokeWidth={2}
                                            />
                                        </Pressable>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>
            </ScrollView>

            <ReportViewer
                report={viewing}
                url={viewing?.url ?? ""}
                onClose={() => setViewing(null)}
            />
        </>
    );
}
