import Constants from "expo-constants";

import type {
    FamilyMember,
    Medicine,
    UserProfile,
} from "@/components/dashboard/types";

import type { HealthProfile } from "./storage";

const API_PORT = 4000;

/**
 * Set to your machine's LAN IP (e.g. "http://192.168.1.5:4000") to override
 * auto-detection when testing on a physical device and hostUri resolution
 * misses. Leave null to auto-detect from the Expo dev server.
 */
const API_URL_OVERRIDE: string | null = null;

function resolveBaseUrl(): string {
    // A built app has no Metro host to infer from, so the deployed API is
    // configured at build time (`.env` / EAS). Expo inlines `EXPO_PUBLIC_*`
    // into the bundle, so this is a literal at runtime, not a live lookup.
    const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
    if (configured) return configured.replace(/\/+$/, "");

    if (API_URL_OVERRIDE) return API_URL_OVERRIDE;

    // In development the Expo dev server (Metro) runs on the same machine as
    // this API, so reuse its host — this works for physical devices via Expo Go
    // and for web. Falls back to localhost for the iOS simulator.
    const hostUri = Constants.expoConfig?.hostUri;
    const host = hostUri?.split(":")[0] ?? "localhost";
    return `http://${host}:${API_PORT}`;
}

export const API_BASE_URL = resolveBaseUrl();

export type RegisterInput = {
    name: string;
    email: string;
    password: string;
    phone?: string;
};

export type LoginInput = {
    email: string;
    password: string;
};

export type PasswordResetRequestInput = {
    email: string;
};

export type PasswordResetConfirmInput = {
    email: string;
    code: string;
    newPassword: string;
};

export type AuthResponse = {
    user: UserProfile;
    accessToken: string;
    refreshToken: string;
};

/** The token pair the server returns on sign-in, and again on every refresh. */
export type TokenPair = {
    accessToken: string;
    refreshToken: string;
};

/** Changing a password from a signed-in session, confirming the current one. */
export type ChangePasswordInput = {
    currentPassword: string;
    newPassword: string;
};

/** The editable half of a profile. Omitted keys are left untouched. */
export type UpdateProfileInput = {
    name?: string;
    phone?: string;
    gender?: string;
    bloodGroup?: string;
    dateOfBirth?: string;
};

/** Who a Family ID belongs to, as resolved by `connectFamily`. */
export type FamilyContact = {
    shareId: string;
    name: string;
};

/** What the client pushes up: only the parts it actually has. */
export type SyncPayload = {
    healthProfile?: HealthProfile | null;
    medicines?: Medicine[];
    familyMembers?: FamilyMember[];
};

/** The account's full state, as the server sees it. */
export type SyncData = {
    healthProfile: HealthProfile | null;
    medicines: Medicine[];
    familyMembers: FamilyMember[];
};

/**
 * The two collections a linked family member shares.
 *
 * Deliberately narrower than `SyncData`: the health profile is the account
 * owner's own medical data and is never exposed to whoever holds their Family
 * ID, so the server returns it only on `/sync`.
 */
export type FamilyData = {
    medicines: Medicine[];
    familyMembers: FamilyMember[];
};

/** Error thrown for non-2xx responses (statusCode 0 = network failure). */
export class ApiError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = "ApiError";
        this.statusCode = statusCode;
    }
}

/* -------------------------------------------------------------------------
 * Session tokens and the refresh that keeps them alive.
 *
 * The pair lives at module scope rather than in React state because a retry
 * has to swap it out *inside* a call, outside any render — no component is
 * mounted at that moment. `AppDataContext` mirrors it into state and onto disk
 * and is told when it changes, but this is what a request consults.
 * ---------------------------------------------------------------------- */

let accessToken: string | null = null;
let refreshToken: string | null = null;

/**
 * Bumped whenever the pair is replaced wholesale. A refresh that started before
 * a sign-out must not resurrect the session when it lands, so it captures this
 * and drops its result if it has moved.
 */
let generation = 0;

/** The in-flight refresh, shared by every caller that hit a 401. */
let refreshInFlight: Promise<string> | null = null;

let onRefreshed: ((pair: TokenPair) => void) | null = null;
let onEnded: (() => void) | null = null;

/**
 * Replace the current pair, or clear it with `null`.
 *
 * Called on sign-in, on hydration and on sign-out — the refresh path updates
 * the module's own copy directly, since it already holds the fresh pair.
 */
export function setSessionTokens(pair: TokenPair | null): void {
    generation += 1;
    accessToken = pair?.accessToken ?? null;
    refreshToken = pair?.refreshToken ?? null;
}

/** The live refresh token, which is not the one on disk once a refresh lands. */
export function getRefreshToken(): string | null {
    return refreshToken;
}

/**
 * Told when a refresh produces a new pair, so it can be persisted, and when a
 * refresh is *rejected* — at which point the session is over, not merely stale,
 * and the caller should sign out rather than keep retrying.
 */
export function setSessionListeners(listeners: {
    onRefreshed?: (pair: TokenPair) => void;
    onEnded?: () => void;
}): void {
    onRefreshed = listeners.onRefreshed ?? null;
    onEnded = listeners.onEnded ?? null;
}

const SESSION_EXPIRED = "Your session has expired. Please sign in again.";

/**
 * Exchange the refresh token for a new pair, and hand back the new access
 * token.
 *
 * Single-flight by force of the server's design: a refresh token is single-use
 * (rotation deletes the row, and reuse is rejected), so two concurrent
 * refreshes would race and the loser would look like a stolen token. Every
 * caller that hit a 401 awaits the same promise instead.
 */
async function refreshAccessToken(): Promise<string> {
    if (refreshInFlight) return refreshInFlight;

    const token = refreshToken;
    if (!token) throw new ApiError(SESSION_EXPIRED, 401);

    const startedAt = generation;

    refreshInFlight = (async () => {
        let res: Response;
        try {
            res = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ refreshToken: token }),
            });
        } catch {
            // Offline, or the server is down. The session may still be good, so
            // this deliberately does not end it — the next call tries again.
            throw new ApiError(
                "Could not reach the server. Check your connection.",
                0,
            );
        }

        if (!res.ok) {
            // Only an explicit refusal of the token itself ends the session:
            // rotated away by another client, revoked by a password change, or
            // expired. Anything else — a 5xx, a 429, a proxy error — is the
            // server having a bad moment, not evidence the token is dead, and
            // treating it as a sign-out would turn a blip into a forced
            // re-login with the tokens thrown away.
            const refused = res.status === 401 || res.status === 403;

            if (refused) {
                if (startedAt === generation) {
                    accessToken = null;
                    refreshToken = null;
                    generation += 1;
                    onEnded?.();
                }
                throw new ApiError(SESSION_EXPIRED, 401);
            }

            const body = (await res.json().catch(() => null)) as {
                error?: { message?: string };
            } | null;
            throw new ApiError(
                body?.error?.message ??
                    "Could not reach the server. Check your connection.",
                res.status,
            );
        }

        const pair = (await res.json()) as TokenPair;
        // A sign-out landed while this was in flight; the new pair belongs to a
        // session the user has already left, so it is discarded.
        if (startedAt !== generation) {
            throw new ApiError(SESSION_EXPIRED, 401);
        }

        accessToken = pair.accessToken;
        refreshToken = pair.refreshToken;
        onRefreshed?.(pair);
        return pair.accessToken;
    })();

    try {
        return await refreshInFlight;
    } finally {
        refreshInFlight = null;
    }
}

/**
 * `authed` marks a call that needs a bearer token. Such a call is retried
 * **once** after a refresh when the server answers 401 — the access token is a
 * 15-minute JWT with no revocation list, so "expired" is the overwhelmingly
 * likely meaning of a 401 and the retry is what makes the expiry invisible.
 *
 * A second 401 is surfaced as-is rather than retried again: if a token minted
 * moments ago is already refused, the problem is not freshness.
 */
async function request<T>(
    path: string,
    init: RequestInit = {},
    authed = false,
): Promise<T> {
    const send = (token: string | null): Promise<Response> => {
        const headers: Record<string, string> = {
            "content-type": "application/json",
            ...(init.headers as Record<string, string> | undefined),
        };
        if (token) headers.authorization = `Bearer ${token}`;
        return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    };

    let res: Response;
    try {
        res = await send(authed ? accessToken : null);
    } catch {
        throw new ApiError(
            "Could not reach the server. Check your connection.",
            0,
        );
    }

    if (res.status === 401 && authed) {
        const fresh = await refreshAccessToken();
        try {
            res = await send(fresh);
        } catch {
            throw new ApiError(
                "Could not reach the server. Check your connection.",
                0,
            );
        }
    }

    const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
    } | null;

    if (!res.ok) {
        throw new ApiError(
            body?.error?.message ?? `Request failed (${res.status})`,
            res.status,
        );
    }

    return body as T;
}

export const api = {
    register: (input: RegisterInput): Promise<AuthResponse> =>
        request<AuthResponse>("/auth/register", {
            method: "POST",
            body: JSON.stringify(input),
        }),
    login: (input: LoginInput): Promise<AuthResponse> =>
        request<AuthResponse>("/auth/login", {
            method: "POST",
            body: JSON.stringify(input),
        }),
    requestPasswordReset: (
        input: PasswordResetRequestInput,
    ): Promise<{ message: string }> =>
        request<{ message: string }>("/auth/password-reset/request", {
            method: "POST",
            body: JSON.stringify(input),
        }),
    confirmPasswordReset: (
        input: PasswordResetConfirmInput,
    ): Promise<{ message: string }> =>
        request<{ message: string }>("/auth/password-reset/confirm", {
            method: "POST",
            body: JSON.stringify(input),
        }),
    logout: (refreshToken: string): Promise<void> =>
        request<void>("/auth/logout", {
            method: "POST",
            body: JSON.stringify({ refreshToken }),
        }),
    /** Pull the account's server-side state (used on sign-in). */
    getSync: (): Promise<SyncData> => request<SyncData>("/sync", {}, true),
    /** Push local data up and get the merged state back. */
    postSync: (input: SyncPayload): Promise<SyncData> =>
        request<SyncData>(
            "/sync",
            { method: "POST", body: JSON.stringify(input) },
            true,
        ),
    /** Update the account's editable profile fields. */
    updateProfile: (
        input: UpdateProfileInput,
    ): Promise<{ user: UserProfile }> =>
        request<{ user: UserProfile }>(
            "/auth/me",
            { method: "PATCH", body: JSON.stringify(input) },
            true,
        ),
    /**
     * Change the account's password.
     *
     * Requires the current password even though the caller is already signed in
     * — a session left open on a shared phone should not be enough to lock the
     * owner out of their own account.
     */
    changePassword: (input: ChangePasswordInput): Promise<{ message: string }> =>
        request<{ message: string }>(
            "/auth/change-password",
            { method: "POST", body: JSON.stringify(input) },
            true,
        ),
    /**
     * Resolve a Family ID to its owner, without pulling any of their data.
     *
     * Unauthenticated on purpose: a guest who has just installed the app can
     * manage a relative's medicines without an account of their own — the code
     * is the credential.
     */
    connectFamily: (shareId: string): Promise<FamilyContact> =>
        request<FamilyContact>("/family/connect", {
            method: "POST",
            body: JSON.stringify({ shareId }),
        }),
    /** Read the linked account's medicines and family members. */
    getFamily: (shareId: string): Promise<FamilyData> =>
        request<FamilyData>(`/family/${encodeURIComponent(shareId)}`),
    /** Append to the linked account's data; returns the merged result. */
    postFamily: (
        shareId: string,
        input: { medicines?: Medicine[]; familyMembers?: FamilyMember[] },
    ): Promise<FamilyData> =>
        request<FamilyData>(`/family/${encodeURIComponent(shareId)}`, {
            method: "POST",
            body: JSON.stringify(input),
        }),
};
