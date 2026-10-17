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
    LocalReport,
    Medicine,
    ReportCategory,
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
import { reconcileUpdateNotice } from "@/lib/notices";
import { syncMedicineReminders } from "@/lib/notifications";
import {
    deleteReportFile,
    localFileExists,
    persistReportFile,
    persistThumbnailFile,
    resolveSize,
    uploadReportFiles,
    type PickedReportFile,
} from "@/lib/reports";
import {
    clearAuthTokens,
    loadAuthTokens,
    loadAuthUser,
    loadFamilyLink,
    loadFamilyMembers,
    loadHealthProfile,
    loadLocalReports,
    loadMedicines,
    loadNotificationsEnabled,
    loadNotices,
    loadOnboarded,
    loadSyncPending,
    saveAuthUser,
    saveAuthTokens,
    saveFamilyLink,
    saveFamilyMembers,
    saveHealthProfile,
    saveLocalReports,
    saveMedicines,
    saveNotificationsEnabled,
    saveNotices,
    saveOnboarded,
    saveSyncPending,
    type AppNotice,
    type FamilyLink,
    type HealthProfile,
} from "@/lib/storage";

/** What a form supplies; the id is generated here. */
type MedicineInput = Omit<Medicine, "id">;
type FamilyMemberInput = Pick<FamilyMember, "name" | "relation" | "age">;
/**
 * What the report form supplies; the id and the stored file are made here.
 *
 * An `OptimizedImage` — the picker's file after `optimizeImage` has had it — so
 * the size recorded is the size that will be uploaded, and the preview it
 * generated comes along to be saved beside the file.
 */
type LocalReportInput = {
    title: string;
    category: ReportCategory;
    takenOn: string;
    file: PickedReportFile & {
        thumbnail: { uri: string; sizeBytes: number } | null;
    };
};

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
    /**
     * Whether this device schedules medicine reminders at all.
     *
     * A device preference, not an account one: it governs what this phone rings
     * for, so a second device on the same account answers for itself.
     */
    notificationsEnabled: boolean;
    /** Turn reminders on or off, cancelling or restoring what is scheduled. */
    setNotificationsEnabled: (enabled: boolean) => void;
    /**
     * The notices behind the notification bell — an app update, and whatever
     * follows it. Null before the first read.
     *
     * In context rather than inside the bell itself because three screens render
     * that bell at once and "read" is a single fact about this device: a copy per
     * screen would let the badge be cleared on one tab and still be standing on
     * another. Keeping it here also means the version check runs once per launch
     * rather than once per mounted screen.
     */
    notices: AppNotice[] | null;
    /** Mark every notice read. What opening the bell does. */
    markNoticesRead: () => void;
    /**
     * Reports added on this device that have no account behind them yet — a
     * guest's, or a signed-in user's whose upload is still owed. They are
     * uploaded and cleared by `flushPendingReports` on the next sign-in.
     */
    localReports: LocalReport[];
    completeOnboarding: (profile: HealthProfile) => void;
    skipOnboarding: () => void;
    /**
     * Save an edit to the health details, from the Overview's edit modal.
     *
     * Distinct from `completeOnboarding`, which also retires the walkthrough and
     * is the first time these questions are answered. This one is a plain save
     * of an already-seen profile, and works for a guest who skipped onboarding
     * just as well as for a signed-in user correcting a value.
     */
    updateHealthProfile: (profile: HealthProfile) => void;
    addMedicine: (input: MedicineInput) => void;
    addFamilyMember: (input: FamilyMemberInput) => void;
    /**
     * Keep a report on this device, copying the picked file into app storage.
     *
     * Throws if the file cannot be copied (no space, for instance) — the form
     * needs to say so rather than show a row that opens nothing.
     */
    addLocalReport: (input: LocalReportInput) => Promise<void>;
    /** Remove a device-only report and its file. */
    deleteLocalReport: (id: string) => Promise<void>;
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
    const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
    /**
     * Notices for the bell, or null before the first read.
     *
     * Null is a distinct state from an empty list: an empty list and an
     * uncomputed one both render as no badge, which is the right look for both,
     * but only one of them is honest about whether the question has been asked.
     */
    const [notices, setNotices] = useState<AppNotice[] | null>(null);
    const [localReports, setLocalReports] = useState<LocalReport[]>([]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const [
                    o,
                    profile,
                    user,
                    meds,
                    members,
                    link,
                    pending,
                    tokens,
                    reports,
                    reminders,
                ] = await Promise.all([
                    loadOnboarded(),
                    loadHealthProfile(),
                    loadAuthUser(),
                    loadMedicines(),
                    loadFamilyMembers(),
                    loadFamilyLink(),
                    loadSyncPending(),
                    loadAuthTokens(),
                    loadLocalReports(),
                    loadNotificationsEnabled(),
                ]);
                if (cancelled) return;
                setOnboarded(o);
                setHealthProfile(profile);
                setAuthUser(user);
                setMedicines(meds);
                setFamilyMembers(members);
                setFamilyLink(link);
                setSyncPending(pending);
                setLocalReports(reports);
                setNotificationsEnabledState(reminders);
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
     * Keep the phone's medicine reminders in step with this device's medicines.
     *
     * Keyed on `medicines` so it also runs after an add and after a sign-in
     * merge, and on `hydrated` so the first run happens once storage has been
     * read — scheduling before that would reconcile against an empty list and
     * cancel everything already scheduled.
     *
     * It reads the medicines back from **storage** rather than using the
     * `medicines` in state, and that distinction is the whole point: while a
     * family member is linked, the on-screen list is *theirs*, and their
     * medicines are managed from their own phone — ringing here for a relative's
     * dose would be both surprising and wrong. `loadMedicines` is always this
     * device's own list, whatever the link is doing to the UI.
     *
     * Fire-and-forget, like `pushOwnMedicine`: the helper never throws, and a
     * reminder that could not be scheduled must not disturb the list.
     *
     * Keyed on `notificationsEnabled` as well, so flipping the switch is itself a
     * reconciliation — off empties the desired set and cancels, on rebuilds it —
     * rather than a separate cancel/restore path that could drift from this one.
     */
    useEffect(() => {
        if (!hydrated) return;
        void loadMedicines()
            .then((meds) => syncMedicineReminders(meds, notificationsEnabled))
            .catch(() => {
                // A failed storage read leaves whatever is already scheduled in
                // place rather than cancelling it — the next run reconciles.
            });
    }, [hydrated, medicines, notificationsEnabled]);

    /**
     * Read the notices on mount, and ask the server whether a newer build exists.
     *
     * Here rather than in the bell because three screens render that bell and all
     * of them must show the same badge — and, as a side benefit, the check runs
     * once per launch instead of once per mounted screen. The two halves answer
     * one question between them: storage is what this device has already been
     * told, and the server's version is what is true now.
     * `reconcileUpdateNotice` turns the pair into the list that should be on
     * screen, and its one real rule is the one the badge depends on: a version
     * already read stays read, a *newer* one comes back unread.
     *
     * A failed check is deliberately silent. The app is offline often and a
     * version lookup is not worth an error for, so the catch keeps whatever is
     * already stored and adds nothing. Keyed on `hydrated` alone, and that is the
     * intent rather than an omission: one attempt per launch, because a stale
     * notice costs the user far less than a spinner in the corner of the screen.
     */
    useEffect(() => {
        if (!hydrated) return;
        let cancelled = false;

        void (async () => {
            const [stored, latest] = await Promise.all([
                loadNotices().catch(() => [] as AppNotice[]),
                api.getAppVersion().catch(() => null),
            ]);

            const next =
                latest === null
                    ? stored
                    : reconcileUpdateNotice(
                          stored,
                          latest.latestVersion,
                          latest.storeUrl,
                      );

            if (cancelled) return;
            setNotices(next);

            // Persisted only when the server answered *and* something moved.
            // The reconcile returns a new array every time it runs, so writing
            // unconditionally would write on every launch with nothing changed.
            // Comparing serialized rather than by identity is the cheap way to
            // tell the two apart; a false mismatch costs one needless write,
            // which is the harmless direction for this to be wrong in.
            const moved = JSON.stringify(next) !== JSON.stringify(stored);
            if (latest !== null && moved) {
                void saveNotices(next).catch(() => {
                    // Worst case this run's read state is lost; the notice is on
                    // screen regardless.
                });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [hydrated]);

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
     * Save the health details edited on the Overview.
     *
     * Local-first, then best-effort up — the same shape as `addMedicine`: the
     * device is written immediately so a guest's edit sticks and so the gauge
     * redraws without a round trip, and the server is told afterwards only if
     * there is an account to tell. A failed push is silent rather than surfaced,
     * matching `syncWithAccount`: this is a save of a few numbers, the local
     * copy is already correct, and the next `POST /sync` carries the profile up
     * with everything else.
     *
     * Note it does **not** go through `POST /sync`, which only seeds a profile
     * for an account that has none — a signed-in edit sent that way would be
     * accepted and silently discarded. See `api.putHealthProfile`.
     */
    const updateHealthProfile = (profile: HealthProfile) => {
        setHealthProfile(profile);
        void saveHealthProfile(profile);
        if (authUser) {
            void api.putHealthProfile(profile).catch(() => {});
        }
    };

    /**
     * Turn medicine reminders on or off for this device.
     *
     * State and disk only — the reminders themselves are reconciled by the effect
     * keyed on this value, so a schedule that fails to update is repaired on the
     * next run rather than leaving the switch disagreeing with the OS.
     */
    const setNotificationsEnabled = (enabled: boolean) => {
        setNotificationsEnabledState(enabled);
        void saveNotificationsEnabled(enabled);
    };

    /**
     * Mark every notice read, which is what opening the bell does.
     *
     * The whole list at once rather than per row: the badge exists to say "there
     * is something here you have not looked at", and once the panel is open the
     * user is looking at it. A per-row read would make the badge count taps
     * instead of unread things, and leave it standing over a panel just read.
     *
     * The write is fire-and-forget. The badge is already gone from the state
     * update, and a failed persist only means the notice shows as unread again
     * next launch — the harmless direction to fail in.
     */
    const markNoticesRead = () => {
        if (notices === null || notices.every((notice) => notice.read)) return;

        const read = notices.map((notice) => ({ ...notice, read: true }));
        setNotices(read);
        void saveNotices(read).catch(() => {});
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
     * Keep a report on this device, copying the picked file out of the picker's
     * cache and into app storage.
     *
     * The copy is what makes a guest's report durable: a picker hands back a
     * temporary URI, and the record has to still open after a restart. That is
     * also why this **throws** where `addMedicine` does not — a record whose file
     * never arrived would render a row that opens nothing, and only the copy can
     * fail.
     *
     * Reports are deliberately not part of the family share (see the server's
     * `routes/reports.ts`), so one added here belongs to whoever holds the
     * device even while a family link is active.
     */
    const addLocalReport = async (input: LocalReportInput) => {
        const id = Crypto.randomUUID();
        const uri = await persistReportFile(input.file, id);

        // Saved after the file, and deliberately allowed to fail: the preview is
        // a convenience, so a copy that cannot be made must not take the report
        // down with it. `""` is the same value a PDF carries, and the list
        // renders the category icon for it.
        const thumbnailUri = input.file.thumbnail
            ? await persistThumbnailFile(input.file.thumbnail.uri, id).catch(
                  () => "",
              )
            : "";

        const report: LocalReport = {
            id,
            title: input.title,
            category: input.category,
            takenOn: input.takenOn,
            file: {
                uri,
                thumbnailUri,
                fileName: input.file.name,
                mimeType: input.file.mimeType,
                sizeBytes: input.file.sizeBytes,
            },
        };

        const next = [report, ...localReports];
        setLocalReports(next);
        await saveLocalReports(next);
    };

    const deleteLocalReport = async (id: string) => {
        const report = localReports.find((entry) => entry.id === id);
        const next = localReports.filter((entry) => entry.id !== id);
        setLocalReports(next);
        await saveLocalReports(next);
        // File last, and only once the record is gone: the record is what the
        // list renders, so a failed unlink after this orphans a file nothing
        // points at, rather than leaving a row that opens nothing.
        if (report) {
            deleteReportFile(report.file.uri);
            // The preview is a second file belonging to the same record, and
            // nothing else references it — left behind it would be unreachable.
            if (report.file.thumbnailUri !== "") {
                deleteReportFile(report.file.thumbnailUri);
            }
        }
    };

    /**
     * Upload the reports this device is holding, and clear the local copies.
     *
     * This is what a guest's reports were waiting for: the same three calls the
     * signed-in form makes — ask for a signed URL, PUT the bytes, record the row
     * — because the file never passes through the API.
     *
     * Per-report rather than all-or-nothing: one bad file must not strand the
     * rest, so a failure leaves *that* record on the device to be retried on the
     * next sign-in while the others go up. Best-effort and silent for the same
     * reason `syncWithAccount` is — it runs inside sign-in, and a report that
     * cannot upload must never be what stops someone signing in.
     *
     * Guarded on the live session token rather than `authUser`: the callers run
     * immediately after `persistSession`, whose `setAuthUser` has not rendered
     * yet, so the state variable still reads as signed out here.
     */
    const flushPendingReports = async () => {
        if (!getRefreshToken() || localReports.length === 0) return;

        const remaining: LocalReport[] = [];
        for (const report of localReports) {
            try {
                const target = await api.getReportUploadUrl({
                    id: report.id,
                    fileName: report.file.fileName,
                    mimeType: report.file.mimeType,
                    sizeBytes: report.file.sizeBytes,
                });

                // A preview that is no longer on disk is dropped rather than
                // uploaded: `uploadReportFile` would throw on the missing file,
                // and a report whose *preview* has been reclaimed by the OS must
                // not be held back on the device forever over it.
                const thumbnail =
                    report.file.thumbnailUri !== "" &&
                    localFileExists(report.file.thumbnailUri)
                        ? {
                              uri: report.file.thumbnailUri,
                              sizeBytes: resolveSize(
                                  report.file.thumbnailUri,
                                  undefined,
                              ),
                          }
                        : null;

                await uploadReportFiles(
                    target,
                    {
                        uri: report.file.uri,
                        name: report.file.fileName,
                        mimeType: report.file.mimeType,
                        sizeBytes: report.file.sizeBytes,
                    },
                    thumbnail,
                );

                await api.createReport({
                    id: report.id,
                    title: report.title,
                    category: report.category,
                    takenOn: report.takenOn,
                    file: {
                        storageKey: target.storageKey,
                        fileName: report.file.fileName,
                        mimeType: report.file.mimeType,
                        sizeBytes: report.file.sizeBytes,
                        thumbnailKey: target.thumbnailKey,
                    },
                });

                // Only now is the local copy redundant. Deleting it before the
                // row exists would lose the only copy of the file.
                deleteReportFile(report.file.uri);
                if (report.file.thumbnailUri !== "") {
                    deleteReportFile(report.file.thumbnailUri);
                }
            } catch {
                remaining.push(report);
            }
        }

        setLocalReports(remaining);
        await saveLocalReports(remaining).catch(() => {});
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
        // Reports are not part of `/sync` (the file never passes through the
        // API), so the local ones are carried up separately.
        await flushPendingReports();
    };

    const signIn = async (input: LoginInput, rememberMe: boolean) => {
        const auth = await api.login(input);
        await persistSession(auth, rememberMe);
        await syncWithAccount();
        await flushPendingReports();
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
                localReports,
                notificationsEnabled,
                notices,
                completeOnboarding,
                skipOnboarding,
                updateHealthProfile,
                setNotificationsEnabled,
                markNoticesRead,
                addMedicine,
                addFamilyMember,
                addLocalReport,
                deleteLocalReport,
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
