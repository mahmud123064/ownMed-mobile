import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
    FamilyMember,
    LocalReport,
    Medicine,
    UserProfile,
} from "@/components/dashboard/types";

import {
    ALL_DAYS,
    isValidDateString,
    parseTime,
    sortDays,
    sortTimes,
    todayISO,
} from "./medicineSchedule";

// This is the device's cache, not the source of truth for a signed-in user:
// AppDataContext pushes it to the server on sign-up/sign-in and adopts what
// comes back (see `syncWithAccount`). For a guest it is the only copy — and
// AsyncStorage is wiped on uninstall, which is what the guest banner warns about.

const KEYS = {
    // Versioned so changing the onboarding flow re-shows the walkthrough
    // (bump ".v2" → ".v3" when the content changes and it should appear again).
    onboarded: "ownmed.onboarded.v2",
    healthProfile: "ownmed.healthProfile",
    authUser: "ownmed.authUser",
    authTokens: "ownmed.authTokens",
    medicines: "ownmed.medicines",
    familyMembers: "ownmed.familyMembers",
    // Reports a guest has added to this device. Unlike medicines these are not a
    // cache of an account — a guest has none — so they are the *only* copy until
    // sign-in uploads them (see `flushPendingReports` in AppDataContext).
    localReports: "ownmed.localReports",
    // The family member whose data this device is currently managing, set by
    // entering their Family ID. Persisted so the link survives a restart.
    familyLink: "ownmed.familyLink",
    // Set when a post-auth sync fails, so the next sign-in knows to push again.
    syncPending: "ownmed.syncPending",
    // Whether medicine reminders may be scheduled at all. A device preference
    // rather than an account one: it governs what *this phone* rings for, and a
    // second device signed into the same account keeps its own answer.
    notificationsEnabled: "ownmed.notificationsEnabled",
} as const;

// TODO(security): move tokens to expo-secure-store. AsyncStorage is unencrypted
// and readable by other code on a rooted/jailbroken device; a health app should
// keep JWTs in the OS keychain/keystore instead.

export type HealthProfile = {
    weightKg: string;
    bloodPressureSys: string;
    bloodPressureDia: string;
    heightCm: string;
    gender: "male" | "female" | "";
};

export async function loadOnboarded(): Promise<boolean> {
    const value = await AsyncStorage.getItem(KEYS.onboarded);
    return value === "true";
}

export async function saveOnboarded(value: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.onboarded, String(value));
}

/**
 * Whether the user wants medicine reminders, defaulting to **on**.
 *
 * The default is a deliberate choice: a user who adds a medicine has asked to be
 * reminded of it, so reminders are what they expect unless they say otherwise.
 * Only an explicit "false" turns them off, which also means a device that never
 * wrote this key — every install up to now — keeps behaving as it did.
 */
export async function loadNotificationsEnabled(): Promise<boolean> {
    const value = await AsyncStorage.getItem(KEYS.notificationsEnabled);
    return value !== "false";
}

export async function saveNotificationsEnabled(value: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.notificationsEnabled, String(value));
}

export async function loadHealthProfile(): Promise<HealthProfile | null> {
    const raw = await AsyncStorage.getItem(KEYS.healthProfile);
    return raw ? (JSON.parse(raw) as HealthProfile) : null;
}

export async function saveHealthProfile(
    profile: HealthProfile,
): Promise<void> {
    await AsyncStorage.setItem(KEYS.healthProfile, JSON.stringify(profile));
}

export async function loadAuthUser(): Promise<UserProfile | null> {
    const raw = await AsyncStorage.getItem(KEYS.authUser);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
}

export async function saveAuthUser(user: UserProfile | null): Promise<void> {
    if (user === null) {
        await AsyncStorage.removeItem(KEYS.authUser);
    } else {
        await AsyncStorage.setItem(KEYS.authUser, JSON.stringify(user));
    }
}

export type AuthTokens = {
    accessToken: string;
    refreshToken: string;
};

export async function saveAuthTokens(tokens: AuthTokens): Promise<void> {
    await AsyncStorage.setItem(KEYS.authTokens, JSON.stringify(tokens));
}

export async function loadAuthTokens(): Promise<AuthTokens | null> {
    const raw = await AsyncStorage.getItem(KEYS.authTokens);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
}

export async function clearAuthTokens(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.authTokens);
}

/** Keep only entries that are real clock times, normalized to "HH:mm". */
function clockTimes(values: unknown[]): string[] {
    return values
        .map((value) => (typeof value === "string" ? parseTime(value) : null))
        .filter((time): time is string => time !== null);
}

/** Keep only entries that are weekday numbers (0=Sun..6=Sat). */
function validDays(values: unknown[]): number[] {
    return values.filter(
        (value): value is number =>
            typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6,
    );
}

/**
 * Coerce a stored record into the current `Medicine` shape.
 *
 * AsyncStorage holds whatever an older build wrote, and there is no schema
 * version to key off, so this has to cope with the previous model — which
 * stored `frequency` ("Twice daily") and `time` ("08:00, 20:00") strings
 * instead of a `times` array. Those records are **salvaged, not dropped**: any
 * clock times found in the legacy `time` string are adopted as the schedule.
 * Times that don't parse are discarded rather than passed on, since the server
 * rejects the whole sync payload over one malformed entry.
 *
 * Returns null for records with no usable id, which the caller filters out.
 *
 * Exported so the storage boundary is testable without AsyncStorage.
 */
export function normalizeMedicine(raw: unknown): Medicine | null {
    if (typeof raw !== "object" || raw === null) return null;
    const record = raw as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id === "") return null;

    let candidates: unknown[] = [];
    if (Array.isArray(record.times)) {
        candidates = record.times;
    } else if (typeof record.time === "string") {
        // Legacy shape. Split on commas so a value like "8 pm, 8 am" survives
        // (splitting on whitespace would tear the meridiem off the hour).
        const parts = record.time.split(",").map((part) => part.trim());
        const parsed = clockTimes(parts);
        candidates = parsed.length > 0 ? parsed : [record.time];
    }

    // Absent weekdays mean a record written when every medicine was daily. An
    // *empty* result is treated the same way: "no days" would mean a medicine
    // that is never taken, which the form refuses to create and the server
    // rejects — one such record would fail the whole sync payload.
    const weekdays = Array.isArray(record.days)
        ? sortDays(validDays(record.days))
        : [];
    const days = weekdays.length > 0 ? weekdays : ALL_DAYS;

    // No recorded start date: the earliest honest answer is "today", since
    // nothing on the device knows when it was actually first taken.
    const rawStartedOn = String(record.startedOn ?? "");
    const hasStart = isValidDateString(rawStartedOn);
    const startedOn = hasStart ? rawStartedOn : todayISO();

    // No end date is a real state, not a gap — an ongoing course — so the
    // fallback is "". A date *before* the start is nonsense the form cannot
    // produce; treat it as ongoing rather than render "Ends Oct 1" under
    // "Started Oct 7". The ordering only means anything when the record really
    // has a start date, so an absent one is not compared against the invented
    // "today" above — that would silently discard a genuine past end date.
    const rawEndedOn = String(record.endedOn ?? "");
    const endedOn =
        isValidDateString(rawEndedOn) && (!hasStart || rawEndedOn >= startedOn)
            ? rawEndedOn
            : "";

    return {
        id: record.id,
        name: typeof record.name === "string" ? record.name : "",
        dosage: typeof record.dosage === "string" ? record.dosage : "",
        times: sortTimes(clockTimes(candidates)),
        days,
        startedOn,
        endedOn,
        // Both are optional by nature (an OTC medicine has no prescriber), so a
        // missing or non-string value is simply "not recorded" — there is no
        // bad state to salvage, only a blank one.
        doctorName:
            typeof record.doctorName === "string" ? record.doctorName : "",
        specialty: typeof record.specialty === "string" ? record.specialty : "",
        // Same as the prescriber fields, with one extra rule: only the two known
        // values survive. A stray value would otherwise be sent back to a server
        // that rejects it, failing the whole sync payload over one bad row.
        mealTiming:
            record.mealTiming === "before" || record.mealTiming === "after"
                ? record.mealTiming
                : "",
    };
}

export async function loadMedicines(): Promise<Medicine[]> {
    const raw = await AsyncStorage.getItem(KEYS.medicines);
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Per-record tolerance: one corrupt entry must not discard the rest.
        return parsed
            .map(normalizeMedicine)
            .filter((medicine): medicine is Medicine => medicine !== null);
    } catch {
        return [];
    }
}

export async function saveMedicines(medicines: Medicine[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.medicines, JSON.stringify(medicines));
}

/**
 * Coerce a stored record into the current `FamilyMember` shape.
 *
 * Mirrors `normalizeMedicine`: AsyncStorage holds whatever an older build wrote,
 * and there is no schema version to key off. Returns null for a record with no
 * usable id, which the caller filters out.
 *
 * `status` is clamped to the two known values for the same reason the server
 * clamps `mealTiming` on the way out — anything else would render as a state the
 * UI has no styling for, since the row's dot is a two-way branch on it.
 *
 * Exported so the storage boundary is testable without AsyncStorage.
 */
export function normalizeFamilyMember(raw: unknown): FamilyMember | null {
    if (typeof raw !== "object" || raw === null) return null;
    const record = raw as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id === "") return null;

    return {
        id: record.id,
        name: typeof record.name === "string" ? record.name : "",
        relation: typeof record.relation === "string" ? record.relation : "",
        // The server sends `age: 0` for a NULL column, so a missing or
        // non-numeric age reads the same way rather than as "undefined yrs".
        age:
            typeof record.age === "number" && Number.isFinite(record.age)
                ? record.age
                : 0,
        healthStatus:
            typeof record.healthStatus === "string" ? record.healthStatus : "",
        status: record.status === "attention" ? "attention" : "stable",
    };
}

export async function loadFamilyMembers(): Promise<FamilyMember[]> {
    const raw = await AsyncStorage.getItem(KEYS.familyMembers);
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Per-record tolerance: one corrupt entry must not discard the rest.
        return parsed
            .map(normalizeFamilyMember)
            .filter((member): member is FamilyMember => member !== null);
    } catch {
        return [];
    }
}

export async function saveFamilyMembers(
    members: FamilyMember[],
): Promise<void> {
    await AsyncStorage.setItem(KEYS.familyMembers, JSON.stringify(members));
}

/** The categories a stored report may carry; see `normalizeLocalReport`. */
const REPORT_CATEGORY_VALUES = [
    "lab",
    "prescription",
    "xray",
    "other",
] as const;

/**
 * Coerce a stored record into the current `LocalReport` shape.
 *
 * Mirrors `normalizeMedicine`: AsyncStorage holds whatever an older build wrote.
 * Returns null for a record with no id **or no file uri** — a report whose bytes
 * cannot be located is not a report, and the list renders an open button for
 * every row, so one without a uri would fail only when the user tapped it.
 *
 * `category` is clamped to the four known values for the same reason
 * `mealTiming` is: the list picks its icon from `CATEGORY_ICONS[category]`, so a
 * value that survived from an older build would index nothing and render
 * undefined.
 *
 * Exported so the storage boundary is testable without AsyncStorage.
 */
export function normalizeLocalReport(raw: unknown): LocalReport | null {
    if (typeof raw !== "object" || raw === null) return null;
    const record = raw as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id === "") return null;

    const file = record.file;
    if (typeof file !== "object" || file === null) return null;
    const fileRecord = file as Record<string, unknown>;
    if (typeof fileRecord.uri !== "string" || fileRecord.uri === "") {
        return null;
    }

    const category = REPORT_CATEGORY_VALUES.find((c) => c === record.category);

    return {
        id: record.id,
        title: typeof record.title === "string" ? record.title : "",
        category: category ?? "other",
        takenOn: typeof record.takenOn === "string" ? record.takenOn : "",
        file: {
            uri: fileRecord.uri,
            // Absent on records written before previews existed, and "" on a PDF
            // — both read as "no preview", so there is nothing to salvage here.
            thumbnailUri:
                typeof fileRecord.thumbnailUri === "string"
                    ? fileRecord.thumbnailUri
                    : "",
            fileName:
                typeof fileRecord.fileName === "string"
                    ? fileRecord.fileName
                    : "",
            mimeType:
                typeof fileRecord.mimeType === "string"
                    ? fileRecord.mimeType
                    : "",
            // The server accepts 0 as "the device could not determine it", and
            // `formatFileSize` renders it as "Unknown size", so 0 is the honest
            // fallback rather than a guess.
            sizeBytes:
                typeof fileRecord.sizeBytes === "number" &&
                Number.isFinite(fileRecord.sizeBytes)
                    ? fileRecord.sizeBytes
                    : 0,
        },
    };
}

export async function loadLocalReports(): Promise<LocalReport[]> {
    const raw = await AsyncStorage.getItem(KEYS.localReports);
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Per-record tolerance: one corrupt entry must not discard the rest.
        return parsed
            .map(normalizeLocalReport)
            .filter((report): report is LocalReport => report !== null);
    } catch {
        return [];
    }
}

export async function saveLocalReports(
    reports: LocalReport[],
): Promise<void> {
    await AsyncStorage.setItem(KEYS.localReports, JSON.stringify(reports));
}

/**
 * A family member whose data this device is managing, identified by their
 * shareable Family ID. `name` is cached purely so the UI can label the link
 * ("Managing Salma") without a round trip.
 */
export type FamilyLink = {
    shareId: string;
    name: string;
};

export async function loadFamilyLink(): Promise<FamilyLink | null> {
    const raw = await AsyncStorage.getItem(KEYS.familyLink);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<FamilyLink>;
        // A link with no code is not a link — treat a half-written record as
        // "not linked" rather than letting an empty id reach the server.
        if (typeof parsed.shareId !== "string" || parsed.shareId === "") {
            return null;
        }
        return {
            shareId: parsed.shareId,
            name: typeof parsed.name === "string" ? parsed.name : "",
        };
    } catch {
        return null;
    }
}

export async function saveFamilyLink(link: FamilyLink | null): Promise<void> {
    if (link === null) {
        await AsyncStorage.removeItem(KEYS.familyLink);
    } else {
        await AsyncStorage.setItem(KEYS.familyLink, JSON.stringify(link));
    }
}

export async function loadSyncPending(): Promise<boolean> {
    return (await AsyncStorage.getItem(KEYS.syncPending)) === "true";
}

export async function saveSyncPending(value: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.syncPending, String(value));
}
