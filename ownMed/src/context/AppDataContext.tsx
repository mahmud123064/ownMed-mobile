import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import * as Crypto from "expo-crypto";

import type {
    FamilyMember,
    Medicine,
    UserProfile,
} from "@/components/dashboard/types";
import {
    api,
    type AuthResponse,
    type LoginInput,
    type PasswordResetConfirmInput,
    type PasswordResetRequestInput,
    type RegisterInput,
    type SyncData,
} from "@/lib/api";
import { recoverFromLocal } from "@/lib/medicineSchedule";
import {
    clearAuthTokens,
    loadAuthTokens,
    loadAuthUser,
    loadFamilyMembers,
    loadHealthProfile,
    loadMedicines,
    loadOnboarded,
    loadSyncPending,
    saveAuthUser,
    saveAuthTokens,
    saveFamilyMembers,
    saveHealthProfile,
    saveMedicines,
    saveOnboarded,
    saveSyncPending,
    type HealthProfile,
} from "@/lib/storage";

/** What a form supplies; the id is generated here. */
type MedicineInput = Omit<Medicine, "id">;
type FamilyMemberInput = Pick<FamilyMember, "name" | "relation" | "age">;

type AppData = {
    /** True once the values below have been loaded from storage. */
    hydrated: boolean;
    onboarded: boolean;
    healthProfile: HealthProfile | null;
    authUser: UserProfile | null;
    medicines: Medicine[];
    familyMembers: FamilyMember[];
    /** True when local data has not reached the server yet (a sync failed). */
    syncPending: boolean;
    completeOnboarding: (profile: HealthProfile) => void;
    skipOnboarding: () => void;
    addMedicine: (input: MedicineInput) => void;
    addFamilyMember: (input: FamilyMemberInput) => void;
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
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
    const [syncPending, setSyncPending] = useState(false);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const [o, profile, user, meds, members, pending] =
                    await Promise.all([
                        loadOnboarded(),
                        loadHealthProfile(),
                        loadAuthUser(),
                        loadMedicines(),
                        loadFamilyMembers(),
                        loadSyncPending(),
                    ]);
                if (cancelled) return;
                setOnboarded(o);
                setHealthProfile(profile);
                setAuthUser(user);
                setMedicines(meds);
                setFamilyMembers(members);
                setSyncPending(pending);
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

    const addMedicine = (input: MedicineInput) => {
        // Client-generated id: it must exist before the row ever reaches the
        // server, so a later sync can upsert it idempotently.
        const medicine: Medicine = { id: Crypto.randomUUID(), ...input };
        const next = [medicine, ...medicines];
        setMedicines(next);
        void saveMedicines(next);
    };

    const addFamilyMember = (input: FamilyMemberInput) => {
        const member: FamilyMember = {
            id: Crypto.randomUUID(),
            ...input,
            healthStatus: "No data yet",
            status: "stable",
        };
        const next = [member, ...familyMembers];
        setFamilyMembers(next);
        void saveFamilyMembers(next);
    };

    /** Adopt the server's view of the account as the new local truth. */
    const applyServerState = (data: SyncData) => {
        // A null profile means the account still has none; keep whatever the
        // device already had rather than dropping it.
        const profile = data.healthProfile ?? healthProfile;
        // The merge is add-only, so a medicine synced before schedules or start
        // dates existed sits on the server blank. The device copy is the last
        // record of what the user set — don't let the blank row erase it.
        const merged = recoverFromLocal(data.medicines, medicines);
        setHealthProfile(profile);
        setMedicines(merged);
        setFamilyMembers(data.familyMembers);
        if (profile) void saveHealthProfile(profile);
        void saveMedicines(merged);
        void saveFamilyMembers(data.familyMembers);
    };

    /**
     * Guest-to-account sync. Pushes the whole local snapshot and adopts the
     * merged result. Best-effort: a failure must never block signing in, so we
     * just flag that local data is still unsynced and let the next sign-in retry.
     */
    const syncWithAccount = async (accessToken: string) => {
        try {
            const data = await api.postSync(
                { healthProfile, medicines, familyMembers },
                accessToken,
            );
            applyServerState(data);
            setSyncPending(false);
            await saveSyncPending(false).catch(() => {});
        } catch {
            setSyncPending(true);
            await saveSyncPending(true).catch(() => {});
        }
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
        const auth = await api.register(input);
        await persistSession(auth, true);
        await syncWithAccount(auth.accessToken);
    };

    const signIn = async (input: LoginInput, rememberMe: boolean) => {
        const auth = await api.login(input);
        await persistSession(auth, rememberMe);
        await syncWithAccount(auth.accessToken);
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
        // Note: local health data is intentionally kept on sign-out. It is this
        // device's cache of the account, and wiping it would lose anything that
        // never made it to the server.
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
                medicines,
                familyMembers,
                syncPending,
                completeOnboarding,
                skipOnboarding,
                addMedicine,
                addFamilyMember,
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
