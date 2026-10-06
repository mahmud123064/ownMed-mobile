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

/** Error thrown for non-2xx responses (statusCode 0 = network failure). */
export class ApiError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = "ApiError";
        this.statusCode = statusCode;
    }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${API_BASE_URL}${path}`, {
            ...init,
            headers: { "content-type": "application/json", ...init.headers },
        });
    } catch {
        throw new ApiError(
            "Could not reach the server. Check your connection.",
            0,
        );
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
    getSync: (accessToken: string): Promise<SyncData> =>
        request<SyncData>("/sync", {
            headers: { authorization: `Bearer ${accessToken}` },
        }),
    /** Push local data up and get the merged state back. */
    postSync: (input: SyncPayload, accessToken: string): Promise<SyncData> =>
        request<SyncData>("/sync", {
            method: "POST",
            headers: { authorization: `Bearer ${accessToken}` },
            body: JSON.stringify(input),
        }),
};
