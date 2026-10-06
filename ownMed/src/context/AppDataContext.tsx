import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";

import type { UserProfile } from "@/components/dashboard/types";
import {
    api,
    type AuthResponse,
    type LoginInput,
    type PasswordResetConfirmInput,
    type PasswordResetRequestInput,
    type RegisterInput,
} from "@/lib/api";
import {
    clearAuthTokens,
    loadAuthTokens,
    loadAuthUser,
    loadHealthProfile,
    loadOnboarded,
    saveAuthUser,
    saveAuthTokens,
    saveHealthProfile,
    saveOnboarded,
    type HealthProfile,
} from "@/lib/storage";

type AppData = {
    /** True once the values below have been loaded from storage. */
    hydrated: boolean;
    onboarded: boolean;
    healthProfile: HealthProfile | null;
    authUser: UserProfile | null;
    completeOnboarding: (profile: HealthProfile) => void;
    skipOnboarding: () => void;
    register: (input: RegisterInput) => Promise<void>;
    signIn: (input: LoginInput, rememberMe: boolean) => Promise<void>;
    requestPasswordReset: (input: PasswordResetRequestInput) => Promise<void>;
    confirmPasswordReset: (input: PasswordResetConfirmInput) => Promise<void>;
    signOut: () => Promise<void>;
};

const AppDataContext = createContext<AppData | undefined>(undefined);

export function AppDataProvider({ children }: { children: ReactNode }) {
    const [hydrated, setHydrated] = useState(false);
    const [onboarded, setOnboarded] = useState(false);
    const [healthProfile, setHealthProfile] = useState<HealthProfile | null>(
        null,
    );
    const [authUser, setAuthUser] = useState<UserProfile | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const [o, profile, user] = await Promise.all([
                    loadOnboarded(),
                    loadHealthProfile(),
                    loadAuthUser(),
                ]);
                if (cancelled) return;
                setOnboarded(o);
                setHealthProfile(profile);
                setAuthUser(user);
            } catch {
                // Storage read failed — fall back to defaults and keep going.
            } finally {
                if (!cancelled) setHydrated(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const completeOnboarding = (profile: HealthProfile) => {
        setHealthProfile(profile);
        setOnboarded(true);
        saveHealthProfile(profile);
        saveOnboarded(true);
    };

    const skipOnboarding = () => {
        setOnboarded(true);
        saveOnboarded(true);
    };

    const persistSession = async (
        { user, accessToken, refreshToken }: AuthResponse,
        remember: boolean,
    ) => {
        setAuthUser(user);
        if (remember) {
            await Promise.all([
                saveAuthUser(user),
                saveAuthTokens({ accessToken, refreshToken }),
            ]);
        } else {
            // Session-only: keep the user in memory but don't persist, and
            // clear any previously-persisted session so a prior "remember me"
            // doesn't linger after a session-only sign-in.
            await Promise.all([saveAuthUser(null), clearAuthTokens()]);
        }
    };

    const register = async (input: RegisterInput) => {
        await persistSession(await api.register(input), true);
    };

    const signIn = async (input: LoginInput, rememberMe: boolean) => {
        await persistSession(await api.login(input), rememberMe);
    };

    const requestPasswordReset = async (input: PasswordResetRequestInput) => {
        await api.requestPasswordReset(input);
    };

    const confirmPasswordReset = async (input: PasswordResetConfirmInput) => {
        await api.confirmPasswordReset(input);
    };

    const signOut = async () => {
        // Best-effort server revoke — a failed read or request must never block
        // the local sign-out.
        const tokens = await loadAuthTokens().catch(() => null);
        if (tokens?.refreshToken) {
            await api.logout(tokens.refreshToken).catch(() => {});
        }
        setAuthUser(null);
        await Promise.all([saveAuthUser(null), clearAuthTokens()]);
    };

    return (
        <AppDataContext.Provider
            value={{
                hydrated,
                onboarded,
                healthProfile,
                authUser,
                completeOnboarding,
                skipOnboarding,
                register,
                signIn,
                requestPasswordReset,
                confirmPasswordReset,
                signOut,
            }}
        >
            {children}
        </AppDataContext.Provider>
    );
}

export function useAppData(): AppData {
    const ctx = useContext(AppDataContext);
    if (!ctx) {
        throw new Error("useAppData must be used within AppDataProvider");
    }
    return ctx;
}
