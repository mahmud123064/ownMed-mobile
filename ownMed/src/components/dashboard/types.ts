import type { LucideIcon } from "lucide-react-native";

export type SectionId =
    | "overview"
    | "profile"
    | "add-medicine"
    | "medicine-history"
    | "family"
    | "reports";

export type Section = {
    id: SectionId;
    label: string;
    icon: LucideIcon;
};

export type HealthStat = {
    id: string;
    label: string;
    value: string;
    unit: string;
    status: "normal" | "warning" | "danger";
    icon: LucideIcon;
    accent: string;
};

export type ActivityItem = {
    id: string;
    title: string;
    subtitle: string;
    time: string;
    icon: LucideIcon;
};

export type Medicine = {
    id: string;
    name: string;
    dosage: string;
    /**
     * Scheduled reminder times, as 24h "HH:mm" strings, sorted ascending and
     * unique. Frequency is *derived* from this (`times.length`) rather than
     * stored, so a medicine can never claim a dose count its schedule
     * contradicts.
     */
    times: string[];
    /**
     * Weekdays the medicine is taken, as `Date.getDay()` values (0=Sun..6=Sat),
     * sorted ascending. A weekday left out is a day it is *not* taken.
     */
    days: number[];
    /**
     * The calendar date the medicine was started, "YYYY-MM-DD" in local time —
     * a date rather than an instant, so it is stored as a plain string.
     */
    startedOn: string;
    /**
     * The date the course ends, same shape as `startedOn`. An empty string means
     * the course is **ongoing** — which is the norm for a chronic medicine, so
     * this is a real state and not a missing value.
     */
    endedOn: string;
    /**
     * Who prescribed it; "" when nobody did — an over-the-counter medicine is a
     * normal case, so this is optional rather than required.
     */
    doctorName: string;
    /** The prescribing doctor's specialty, e.g. "Cardiology"; "" when unknown. */
    specialty: string;
    /**
     * Whether it is taken before or after food; "" when it has no meal relation
     * or none was recorded. Optional rather than required for the same reason as
     * `doctorName` — plenty of medicines are neither, and the form must be able
     * to record them.
     */
    mealTiming: MealTiming;
};

/** When a medicine is taken relative to food. "" = not recorded. */
export type MealTiming = "before" | "after" | "";

export type Doctor = {
    id: string;
    name: string;
    department: string;
    hospital: string;
    rating: number;
    available: boolean;
    slots: string[];
};

export type Pharmacy = {
    id: string;
    name: string;
    distance: string;
    open: boolean;
    rating: number;
};

export type Hospital = {
    id: string;
    name: string;
    distance: string;
    departments: string[];
    rating: number;
};

export type Appointment = {
    id: string;
    doctor: string;
    department: string;
    date: string;
    time: string;
    status: "upcoming" | "completed" | "cancelled";
};

export type FamilyMember = {
    id: string;
    name: string;
    relation: string;
    age: number;
    healthStatus: string;
    status: "stable" | "attention";
};

/** What kind of document a report is. Drives the label and the list's icon. */
export type ReportCategory = "lab" | "prescription" | "xray" | "other";

/**
 * The uploaded document behind a report.
 *
 * The bytes live in object storage, not on this device, so there is no local
 * URI here — `storageKey` names the object and the server trades it for a
 * short-lived URL when the report is opened. That is why nothing in this shape
 * is viewable offline.
 */
export type ReportFile = {
    /** The object's key in the bucket; also what the server signs a URL for. */
    storageKey: string;
    /** The name the file had on the device, shown in the list. */
    fileName: string;
    /** e.g. "application/pdf" or "image/jpeg" — decides how it is opened. */
    mimeType: string;
    sizeBytes: number;
    /**
     * The key of a small preview of this report, generated on the device and
     * uploaded beside the file. `""` when there is none — a PDF has no pixels to
     * shrink, and rows written before previews existed have none either, which
     * the list renders as the category icon instead.
     */
    thumbnailKey: string;
};

/**
 * An uploaded medical document — a lab result, a scan, a prescription.
 *
 * Unlike `Medicine` and `FamilyMember`, a report is **not** part of the local
 * snapshot that `/sync` merges: there is no AsyncStorage copy, and the list is
 * read from the server each time the section opens. A report also belongs only
 * to the account that uploaded it — it is not exposed by Family ID.
 */
export type Report = {
    id: string;
    title: string;
    category: ReportCategory;
    /** The date the report is *about*, "YYYY-MM-DD"; "" when not recorded. */
    takenOn: string;
    file: ReportFile;
};

/**
 * A report that exists only on this device.
 *
 * A guest has no account for a report to belong to, so there is nowhere on the
 * server to put one and no `userId` to key the object under. Rather than refuse
 * the upload outright, the file is kept in the app's own document directory and
 * this record points at it — the same local-first bargain as `Medicine`: the
 * data is real and usable, but it is *this device's*, so uninstalling the app
 * takes it with it.
 *
 * The difference from `Report` is `file.uri`: a server report names an object in
 * the bucket, while this names a file in the app's sandbox. Signing in is what
 * promotes one of these into a `Report` — see `flushPendingReports`.
 */
export type LocalReport = {
    id: string;
    title: string;
    category: ReportCategory;
    /** The date the report is *about*, "YYYY-MM-DD"; "" when not recorded. */
    takenOn: string;
    file: {
        /** A `file://` path inside the app's document directory. */
        uri: string;
        /**
         * A `file://` path to a small preview, saved next to the file. `""` when
         * there is none — a PDF, or a record written before previews existed.
         * Kept as a file rather than re-derived on each render so the list does
         * not decode the full-size image just to draw a 44 px square, which is
         * the whole reason it exists.
         */
        thumbnailUri: string;
        /** The name the file had when it was picked, shown in the list. */
        fileName: string;
        /** e.g. "application/pdf" — decides how it is opened. */
        mimeType: string;
        sizeBytes: number;
    };
};

export type UserProfile = {
    /** Present for users created by the backend; absent for the local mock user. */
    id?: string;
    /**
     * The shareable "Family ID" — a short code a relative can enter to manage
     * this account's medicines and family members. Absent for guests, who have
     * no account to share.
     */
    shareId?: string;
    name: string;
    email: string;
    phone: string;
    /** "male" | "female" | "other"; "" (or absent) when not set. */
    gender?: string;
    /** A blood group label like "O+"; "" (or absent) when not set. */
    bloodGroup?: string;
    /** Date of birth as "YYYY-MM-DD"; "" (or absent) when not set. */
    dateOfBirth?: string;
};
