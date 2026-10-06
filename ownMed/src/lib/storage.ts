import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
    FamilyMember,
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
    // Set when a post-auth sync fails, so the next sign-in knows to push again.
    syncPending: "ownmed.syncPending",
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

export async function loadFamilyMembers(): Promise<FamilyMember[]> {
    const raw = await AsyncStorage.getItem(KEYS.familyMembers);
    return raw ? (JSON.parse(raw) as FamilyMember[]) : [];
}

export async function saveFamilyMembers(
    members: FamilyMember[],
): Promise<void> {
    await AsyncStorage.setItem(KEYS.familyMembers, JSON.stringify(members));
}

export async function loadSyncPending(): Promise<boolean> {
    return (await AsyncStorage.getItem(KEYS.syncPending)) === "true";
}

export async function saveSyncPending(value: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.syncPending, String(value));
}
