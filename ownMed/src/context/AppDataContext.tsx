import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";

import type {
    FamilyMember,
    Medicine,
    UserProfile,
} from "@/components/dashboard/types";
import {
    api,
    getRefreshToken,
    setSessionListeners,
    setSessionTokens,
    type AuthResponse,
    type ChangePasswordInput,
    type FamilyContact,
    type LoginInput,
    type PasswordResetConfirmInput,
    type PasswordResetRequestInput,
    type RegisterInput,
    type SyncData,
    type UpdateProfileInput,
} from "@/lib/api";
import { recoverFromLocal } from "@/lib/medicineSchedule";
import {
    clearAuthTokens,
    loadAuthTokens,
    loadAuthUser,
    loadFamilyLink,
    loadFamilyMembers,
    loadHealthProfile,
    loadMedicines,
    loadOnboarded,
    loadSyncPending,
    saveAuthUser,
    saveAuthTokens,
    saveFamilyLink,
    saveFamilyMembers,
    saveHealthProfile,
    saveMedicines,
    saveOnboarded,
    saveSyncPending,
    type FamilyLink,
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
    /**
     * The medicines in the **active scope**: the user's own, or — while
     * `familyLink` is set — the linked family member's.
     */
    medicines: Medicine[];
    /** Family members in the active scope; see `medicines`. */
    familyMembers: FamilyMember[];
    /**
     * The family member whose data this device is managing, or null when the
     * user is looking at their own. Set by entering a Family ID.
     */
    familyLink: FamilyLink | null;
    /** True when local data has not reached the server yet (a sync failed). */
    syncPending: boolean;
    completeOnboarding: (profile: HealthProfile) => void;
    skipOnboarding: () => void;
    addMedicine: (input: MedicineInput) => void;
    addFamilyMember: (input: FamilyMemberInput) => void;
    /** Resolve a Family ID to its owner without linking yet. Throws if unknown. */
    lookupFamily: (shareId: string) => Promise<FamilyContact>;
    /** Start managing a resolved family member's data. */
    connectFamily: (contact: FamilyContact) => Promise<void>;
    /** Stop managing it and go back to the user's own data. */
    disconnectFamily: () => Promise<void>;
    /** Save the account's editable profile fields. Throws when signed out. */
    updateProfile: (input: UpdateProfileInput) => Promise<void>;
    /** Change the account's password. Throws when signed out. */
    changePassword: (input: ChangePasswordInput) => Promise<void>;
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
    /**
     * Whether this session was signed in with "remember me".
     *
     * The live tokens themselves live in `lib/api`, which is what a request
     * actually consults (a retry swaps them mid-call, outside any render). This
     * is only the answer to "should a *refreshed* pair also go to disk?" — a
     * session-only sign-in keeps nothing there, so writing on refresh would
     * quietly turn it into a remembered one.
     */
    const rememberSession = useRef(false);
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
    const [familyLink, setFamilyLink] = useState<FamilyLink | null>(null);
    const [syncPending, setSyncPending] = useState(false);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const [o, profile, user, meds, members, link, pending, tokens] =
                    await Promise.all([
                        loadOnboarded(),
                        loadHealthProfile(),
                        loadAuthUser(),
                        loadMedicines(),
                        loadFamilyMembers(),
                        loadFamilyLink(),
                        loadSyncPending(),
                        loadAuthTokens(),
                    ]);
                if (cancelled) return;
                setOnboarded(o);
                setHealthProfile(profile);
                setAuthUser(user);
                setMedicines(meds);
                setFamilyMembers(members);
                setFamilyLink(link);
                setSyncPending(pending);
                // Only ever present for a remembered session — a session-only
                // sign-in leaves nothing on disk to restore. The access token
                // is very likely expired by now; the first authenticated call
                // will 401 and refresh it using the stored refresh token, which
                // is exactly what that path is for.
                if (tokens) {
                    rememberSession.current = true;
                    setSessionTokens(tokens);
                }
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

    /**
     * What to do about the two things a token refresh can tell us.
     *
     * Registered once, and deliberately reading `rememberSession` through the
     * ref: the listener outlives any render, so a captured value would freeze
     * at whatever it was when the effect first ran.
     */
    useEffect(() => {
        setSessionListeners({
            onRefreshed: (pair) => {
                // Only a remembered session keeps tokens on disk. A refreshed
                // pair must replace the old one there, or the next launch would
                // restore a refresh token the server has already rotated away.
                if (rememberSession.current) void saveAuthTokens(pair);
            },
            onEnded: () => {
                // The refresh token was refused, so this session is finished
                // rather than merely stale — there is nothing left to retry.
                // Clear locally without calling the server: the tokens are
                // already dead, and `/auth/logout` would be a no-op anyway.
                rememberSession.current = false;
                setSessionTokens(null);
                setAuthUser(null);
                void Promise.all([saveAuthUser(null), clearAuthTokens()]);
                // Land on the sign-in screen rather than leaving the user on a
                // dashboard that has silently become the guest view.
                router.replace("/sign-in");
            },
        });
        return () => setSessionListeners({});
    }, []);

    /**
     * While linked, the lists on screen are the family member's, not ours.
     *
     * Run off `familyLink` rather than inside `connectFamily` so it also covers
     * the restart case: a persisted link reloads our *own* cached lists from
     * disk (that is all the device has), and this replaces them with the linked
     * account's. `shareId` is the dependency rather than the link object so a
     * rename of the cached label doesn't refetch.
     */
    const linkedShareId = familyLink?.shareId ?? null;
    useEffect(() => {
        if (!hydrated || !linkedShareId) return;
        let cancelled = false;

        (async () => {
            try {
                const data = await api.getFamily(linkedShareId);
                if (cancelled) return;
                setMedicines(data.medicines);
                setFamilyMembers(data.familyMembers);
            } catch {
                // Offline or the code went stale. Leave the current lists up
                // rather than blanking the screen; the banner still shows who
                // is linked, and Disconnect always works.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [hydrated, linkedShareId]);

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

    /**
     * Push an add to the linked family member's account, then adopt the merged
     * result so a second person editing the same list stays in sync.
     *
     * Best-effort, like `syncWithAccount`: the optimistic update is already on
     * screen, so a failed push leaves the UI usable — and since the server's
     * merge is add-only, the next add carries the missed row up with it.
     */
    const pushFamily = async (
        link: FamilyLink,
        input: { medicines?: Medicine[]; familyMembers?: FamilyMember[] },
    ) => {
        try {
            const data = await api.postFamily(link.shareId, input);
            setMedicines(data.medicines);
            setFamilyMembers(data.familyMembers);
        } catch {
            // The optimistic row is already displayed; nothing to undo.
        }
    };

    /**
     * Push one of our own medicines to the account, right after it is added.
     *
     * Without this the row only reaches the server on the next sign-in's full
     * sync, so an add could sit on the device indefinitely. Reuses `POST /sync`
     * (the same add-only, idempotent merge), so a retry is always safe.
     *
     * Best-effort like `pushFamily`, and deliberately does **not** adopt the
     * response: the optimistic list is already correct, while the server's
     * snapshot would omit any other local row that has not been pushed yet.
     *
     * A guest simply keeps the add locally; the next sign-in carries it.
     */
    const pushOwnMedicine = async (medicine: Medicine) => {
        if (!authUser) return;
        try {
            await api.postSync({ medicines: [medicine] });
        } catch {
            // Still on screen and on disk; the next sync will pick it up.
        }
    };

    const addMedicine = (input: MedicineInput) => {
        // Client-generated id: it must exist before the row ever reaches the
        // server, so a later sync can upsert it idempotently.
        const medicine: Medicine = { id: Crypto.randomUUID(), ...input };
        const next = [medicine, ...medicines];
        setMedicines(next);

        if (familyLink) {
            // Someone else's medicine belongs on *their* account. Saving it to
            // this device's cache would leave it behind in our own list the
            // moment the link is dropped.
            void pushFamily(familyLink, { medicines: [medicine] });
            return;
        }
        void saveMedicines(next);
        void pushOwnMedicine(medicine);
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

        if (familyLink) {
            void pushFamily(familyLink, { familyMembers: [member] });
            return;
        }
        void saveFamilyMembers(next);
    };

    /**
     * Resolve a Family ID to whoever owns it. Separate from `connectFamily` so
     * the UI can name the person and ask before switching scope — and so a
     * mistyped code fails before anything changes.
     */
    const lookupFamily = (shareId: string) => api.connectFamily(shareId);

    const connectFamily = async (contact: FamilyContact) => {
        const link: FamilyLink = {
            shareId: contact.shareId,
            name: contact.name,
        };
        setFamilyLink(link);
        await saveFamilyLink(link);
    };

    const disconnectFamily = async () => {
        setFamilyLink(null);
        await saveFamilyLink(null);
        // Restore our own lists from the device cache. They were never
        // overwritten while linked (see `addMedicine`), so this is the user's
        // own data, not the family member's.
        const [meds, members] = await Promise.all([
            loadMedicines(),
            loadFamilyMembers(),
        ]);
        setMedicines(meds);
        setFamilyMembers(members);
    };

    const updateProfile = async (input: UpdateProfileInput) => {
        if (!authUser) {
            throw new Error("Sign in to save your profile details.");
        }
        const { user } = await api.updateProfile(input);
        setAuthUser(user);
        await saveAuthUser(user);
    };

    const changePassword = async (input: ChangePasswordInput) => {
        if (!authUser) {
            throw new Error("Sign in to change your password.");
        }
        await api.changePassword(input);
    };

    /**
     * Adopt the server's view of the account as the new local truth.
     *
     * `adoptDomain` is false while a family link is active. The account's own
     * medicines are still written to the device cache — that is what the cache
     * is for — but the lists *on screen* belong to the linked member, so
     * swapping them would contradict the "Managing …" banner.
     *
     * `localMedicines` is likewise the device's own copy, not the on-screen
     * list, for the same reason: `recoverFromLocal` matches by id, and matching
     * against another account's records would be meaningless at best.
     */
    const applyServerState = (
        data: SyncData,
        adoptDomain: boolean,
        localMedicines: Medicine[],
    ) => {
        // A null profile means the account still has none; keep whatever the
        // device already had rather than dropping it.
        const profile = data.healthProfile ?? healthProfile;
        // The merge is add-only, so a medicine synced before schedules or start
        // dates existed sits on the server blank. The device copy is the last
        // record of what the user set — don't let the blank row erase it.
        const merged = recoverFromLocal(data.medicines, localMedicines);
        setHealthProfile(profile);
        if (adoptDomain) {
            setMedicines(merged);
            setFamilyMembers(data.familyMembers);
        }
        if (profile) void saveHealthProfile(profile);
        void saveMedicines(merged);
        void saveFamilyMembers(data.familyMembers);
    };

    /**
     * Guest-to-account sync. Pushes the whole local snapshot and adopts the
     * merged result. Best-effort: a failure must never block signing in, so we
     * just flag that local data is still unsynced and let the next sign-in retry.
     */
    const syncWithAccount = async () => {
        try {
            // Signing in while linked must push *this device's own* data, never
            // the lists on screen — those belong to the family member, and
            // sending them would quietly copy their records into this account.
            const [ownMedicines, ownMembers] = familyLink
                ? await Promise.all([loadMedicines(), loadFamilyMembers()])
                : [medicines, familyMembers];

            const data = await api.postSync({
                healthProfile,
                medicines: ownMedicines,
                familyMembers: ownMembers,
            });
            applyServerState(data, familyLink === null, ownMedicines);
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
        // The pair goes to `lib/api` for the life of the session either way;
        // "remember me" only decides whether it *also* goes to disk.
        setSessionTokens({ accessToken, refreshToken });
        rememberSession.current = remember;
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
        await syncWithAccount();
    };

    const signIn = async (input: LoginInput, rememberMe: boolean) => {
        const auth = await api.login(input);
        await persistSession(auth, rememberMe);
        await syncWithAccount();
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
        //
        // The token comes from the live session rather than from disk: once a
        // refresh has happened the stored copy is the *old*, already-rotated
        // one, and revoking that would leave the real session alive on the
        // server. Queried before the tokens are cleared, for the same reason.
        const token = getRefreshToken();
        if (token) {
            await api.logout(token).catch(() => {});
        }
        // Drop any active family link first. Its lists are the only ones that
        // are *not* this device's own data, and leaving them in state would
        // hand them to whoever signs in next — `syncWithAccount` pushes the
        // in-memory lists when no link is set, which is exactly the case after
        // this. `disconnectFamily` also restores our own cached lists.
        if (familyLink) {
            await disconnectFamily().catch(() => {});
        }
        // Note: local health data is intentionally kept on sign-out. It is this
        // device's cache of the account, and wiping it would lose anything that
        // never made it to the server.
        setAuthUser(null);
        rememberSession.current = false;
        // Cleared last: `setSessionTokens(null)` bumps the generation, so a
        // refresh still in flight knows to discard its result rather than
        // resurrect the session that is being torn down.
        setSessionTokens(null);
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
                familyLink,
                syncPending,
                completeOnboarding,
                skipOnboarding,
                addMedicine,
                addFamilyMember,
                lookupFamily,
                connectFamily,
                disconnectFamily,
                updateProfile,
                changePassword,
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
