import AsyncStorage from "@react-native-async-storage/async-storage";

import type { UserProfile } from "@/components/dashboard/types";

// TODO(backend): sync authUser + healthProfile to a server for cross-reinstall
// persistence. Until then everything lives in AsyncStorage, which is wiped on
// uninstall — so both guest and registered data are device-local for now.

const KEYS = {
    // Versioned so changing the onboarding flow re-shows the walkthrough
    // (bump ".v2" → ".v3" when the content changes and it should appear again).
    onboarded: "ownmed.onboarded.v2",
    healthProfile: "ownmed.healthProfile",
    authUser: "ownmed.authUser",
    authTokens: "ownmed.authTokens",
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
