import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

import type { Medicine } from "@/components/dashboard/types";

/**
 * Type-only, and that is load-bearing rather than a style choice — see
 * `loadNotificationsApi` below for why this module must not *load*
 * `expo-notifications` just by being imported.
 */
import type * as Notifications from "expo-notifications";

import {
    daysOf,
    endedOnOf,
    mealTimingOf,
    parseTime,
    sortDays,
    startedOnOf,
    timesOf,
    todayISO,
} from "./medicineSchedule";

/**
 * Medicine reminders, as **local** notifications.
 *
 * Local rather than push, and the reason is structural: a reminder's whole
 * content — which medicine, what dose, at what time — is already on this device
 * in the medicine list, and its schedule is fully derivable from `times` +
 * `days`. Sending it through a server would mean push tokens, a worker that
 * wakes up at every dose time, and a network round trip standing between a
 * patient and their medicine, all to deliver information the phone already has.
 * Local notifications also fire with no connection and survive the app being
 * killed, which is the only way a reminder can be trusted.
 *
 * The unit of work here is **reconciliation**, not scheduling. Medicines are
 * append-only — there is no edit or delete — so the set of reminders has to be
 * re-derived and diffed against what the OS already holds: that is what stops a
 * finished course from ringing forever (its `endedOn` has passed, so it drops
 * out of the desired set), and what repairs the queue after a reinstall or the
 * OS clearing pending notifications on its own.
 */

/** The module's shape, taken from the type-only import above. */
type NotificationsApi = typeof Notifications;

/**
 * `expo-notifications` where the platform can provide it, else null.
 *
 * **Importing that package throws on Android in Expo Go**, before a line of this
 * file runs: its `index.js` re-exports `DevicePushTokenAutoRegistration.fx`,
 * whose module scope registers a push-token listener, and that calls a guard
 * which deliberately raises on Android in Expo Go ("remote notifications were
 * removed from Expo Go with the release of SDK 53"). A static import anywhere
 * reachable from the root layout therefore takes the whole app down at launch —
 * which is what this loader exists to prevent. The only fix is to not import it
 * until we know it can load, so the import above is type-only (erased at
 * compile time) and the real one happens here, behind the same test.
 *
 * The consequence is deliberate: where the module cannot load, reminders do not
 * exist rather than being unhandled. That is the same degradation as a user who
 * denied the notification permission — the app is unaffected, the bell still
 * lists the schedule, and `remindersSupported()` lets the UI say so out loud
 * instead of offering a switch that does nothing. Note that iOS Expo Go *can*
 * serve reminders (the package only warns there), so this is not "Expo Go is
 * unsupported" but a narrower statement about one platform.
 */
const api: NotificationsApi | null = loadNotificationsApi();

function loadNotificationsApi(): NotificationsApi | null {
    // No scheduling on web, and this app does build for it.
    if (Platform.OS === "web") return null;
    if (isRunningInExpoGo() && Platform.OS === "android") return null;

    try {
        // Deliberately `require` and not an import: a static import is hoisted
        // and evaluated before the checks above, which is precisely the crash
        // this loader exists to avoid.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require("expo-notifications") as NotificationsApi;
    } catch (error) {
        // Anything else that stops the module initialising lands here rather
        // than crashing the app. Warned once, in development only, so a real
        // failure is not silent while users are not shown a stack trace.
        if (__DEV__) {
            console.warn(
                "[ownmed] Medicine reminders are unavailable on this device:",
                error,
            );
        }
        return null;
    }
}

/**
 * Whether this device can schedule medicine reminders at all.
 *
 * For the UI to answer honestly: a settings switch that flips to "On" while
 * nothing can ring is worse than saying it is unavailable. False only where the
 * module cannot load — see `loadNotificationsApi`.
 */
export function remindersSupported(): boolean {
    return api !== null;
}

/**
 * The trigger kinds, or null where reminders do not exist.
 *
 * Split out from `api` so the sync builders — which are kept free of the module
 * on purpose — can still name the SDK's own enum members rather than repeating
 * their string values. This file cannot refer to `SchedulableTriggerInputTypes`
 * by importing it, and a bare `"calendar"` is not assignable to the enum type,
 * so the values have to be reached through the loaded module like this.
 */
const triggerKinds = api === null ? null : api.SchedulableTriggerInputTypes;

/**
 * The Android channel every reminder is posted to.
 *
 * Android 8+ decides a notification's sound and, crucially, its *importance*
 * from the channel rather than the notification, and an app that never creates
 * one gets the system default — which is not a heads-up banner. A dose reminder
 * is worth interrupting for, so this channel is created explicitly at `HIGH`.
 */
const REMINDER_CHANNEL_ID = "medicine-reminders";

/**
 * The prefix every reminder identifier carries.
 *
 * Identifiers are the reconciliation key: a scheduled notification is compared
 * against the desired set by name, so this prefix is also what distinguishes a
 * reminder *we* scheduled from anything else in the OS queue — never cancel a
 * notification that does not start with it.
 */
const REMINDER_PREFIX = "reminder:med:";

/**
 * The sound a reminder plays, named as a **file** rather than a resource id.
 *
 * `assets/reminder.wav` is registered with the `expo-notifications` plugin, which
 * copies it to `res/raw/reminder.wav` on Android and bundles it as an Xcode
 * resource on iOS — and both platforms then refer to it by that bare filename.
 * The file is the user's own spoken reminder; replacing it at the same path is
 * all a new recording needs, since nothing here names the clip's *contents*.
 */
const REMINDER_SOUND = "reminder.wav";

/** The identifier for one daily dose, or one dose on one weekday. */
function reminderKey(
    medicineId: string,
    time: string,
    day?: number,
): string {
    return `${REMINDER_PREFIX}${medicineId}:${time}${day === undefined ? "" : `:${day}`}`;
}

/**
 * Whether a notification identifier names one of our reminders.
 *
 * Exported for the tap handler, which must not hijack a tap on some future
 * notification that has nothing to do with medicines. The prefix is the only
 * thing that distinguishes them, so the test for it belongs here beside the
 * function that mints it rather than being re-spelled at the call site.
 */
export function isMedicineReminder(identifier: string): boolean {
    return identifier.startsWith(REMINDER_PREFIX);
}

/** The bold line — the medicine's name. */
function reminderTitle(medicine: Medicine): string {
    return medicine.name.trim() !== "" ? medicine.name.trim() : "Medicine reminder";
}

/**
 * The second line: the dose, and how to take it.
 *
 * A reminder that only says "Time to take your medicine" makes the user open the
 * app to find out what they are taking, which is the friction this is meant to
 * remove. The dosage and the meal relation are the two facts that change what
 * someone actually does, so both go in the notification itself.
 */
function reminderBody(medicine: Medicine): string {
    const parts: string[] = [];
    const dosage = medicine.dosage.trim();
    if (dosage !== "") parts.push(dosage);

    const timing = mealTimingOf(medicine);
    if (timing !== "") {
        parts.push(timing === "before" ? "before food" : "after food");
    }

    return parts.length > 0 ? parts.join(" · ") : "Time to take your medicine.";
}

/**
 * Whether a medicine's course covers today.
 *
 * A course that has not started yet must not remind, and neither must one whose
 * `endedOn` has passed. An ended date of *today* still counts as active: a
 * course that ends today includes today's doses. Comparing the "YYYY-MM-DD"
 * strings directly is safe — they are zero-padded, so lexicographic order is
 * calendar order.
 */
function isActiveToday(medicine: Medicine): boolean {
    const today = todayISO();
    if (startedOnOf(medicine) > today) return false;
    const ended = endedOnOf(medicine);
    return ended === "" || ended >= today;
}

/**
 * A repeating trigger at a time of day, every day.
 *
 * The two platforms have no shared representation, which is the one genuinely
 * awkward part of this API: Android takes `daily`, while iOS has no such trigger
 * and reaches the same behaviour through a calendar trigger that repeats on its
 * `hour`/`minute` components.
 *
 * Null where reminders do not exist at all, which is what lets
 * `buildReminderRequests` stay free of the module — see `triggerKinds`.
 */
function dailyTrigger(
    hour: number,
    minute: number,
): Notifications.SchedulableNotificationTriggerInput | null {
    if (triggerKinds === null) return null;
    return Platform.OS === "ios"
        ? {
              type: triggerKinds.CALENDAR,
              hour,
              minute,
              repeats: true,
          }
        : {
              type: triggerKinds.DAILY,
              hour,
              minute,
              channelId: REMINDER_CHANNEL_ID,
          };
}

/**
 * A repeating trigger at a time of day, once a week on one weekday.
 *
 * `day` is a `Date.getDay()` value (0=Sun..6=Sat), but **both** platforms number
 * weekdays from 1 with Sunday first, so it is shifted here. Getting this wrong
 * is a silent one-day offset that still "works", which is exactly why the
 * conversion lives in one function with its reason attached.
 *
 * Null under the same condition as `dailyTrigger`.
 */
function weeklyTrigger(
    hour: number,
    minute: number,
    day: number,
): Notifications.SchedulableNotificationTriggerInput | null {
    if (triggerKinds === null) return null;
    const weekday = day + 1;
    return Platform.OS === "ios"
        ? {
              type: triggerKinds.CALENDAR,
              hour,
              minute,
              weekday,
              repeats: true,
          }
        : {
              type: triggerKinds.WEEKLY,
              hour,
              minute,
              weekday,
              channelId: REMINDER_CHANNEL_ID,
          };
}

/**
 * Every notification the given medicines should have scheduled.
 *
 * Pure — it reads medicines and returns requests, touching nothing — so the
 * rules that decide *what* a patient is reminded of can be reasoned about and
 * tested without a device. `syncMedicineReminders` is what puts them on the OS.
 *
 * A daily medicine (all seven weekdays) collapses to **one** repeating trigger
 * per time rather than seven, which keeps the pending queue small: iOS caps an
 * app at 64 pending notifications, and a sevenfold inflation would reach that
 * with a handful of medicines.
 *
 * Empty where the platform cannot schedule at all — the trigger builders return
 * null there — so this needs no knowledge of the module's availability.
 */
export function buildReminderRequests(
    medicines: Medicine[],
): Notifications.NotificationRequestInput[] {
    const requests: Notifications.NotificationRequestInput[] = [];

    for (const medicine of medicines) {
        if (!isActiveToday(medicine)) continue;

        const days = sortDays(daysOf(medicine));
        if (days.length === 0) continue;
        const daily = days.length === 7;

        const title = reminderTitle(medicine);
        const body = reminderBody(medicine);

        for (const time of timesOf(medicine)) {
            // Normalized rather than trusted: a stored time may come from an
            // older build, and `parseTime` is what the rest of the app uses to
            // decide a string is a real clock time.
            const normalized = parseTime(time);
            if (normalized === null) continue;
            const [hour, minute] = normalized.split(":").map(Number);
            // No `data` payload: the identifier already carries the medicine id
            // and the time, and one is read where the other would be. A payload
            // nothing consumes would only be a second copy to keep in step.
            const content = { title, body, sound: REMINDER_SOUND } as const;

            if (daily) {
                const trigger = dailyTrigger(hour, minute);
                if (trigger === null) continue;
                requests.push({
                    identifier: reminderKey(medicine.id, normalized),
                    content,
                    trigger,
                });
                continue;
            }

            for (const day of days) {
                const trigger = weeklyTrigger(hour, minute, day);
                if (trigger === null) continue;
                requests.push({
                    identifier: reminderKey(medicine.id, normalized, day),
                    content,
                    trigger,
                });
            }
        }
    }

    return requests;
}

/** One dose of one medicine, at one time of day. */
export type ScheduledDose = {
    medicine: Medicine;
    /** A normalized 24h "HH:mm", ready to display and to match a reminder. */
    time: string;
};

/**
 * Every dose due today, in the order the day will ask for them.
 *
 * Pure, and derived from the schedule rather than from the OS's pending queue:
 * the queue is the authority on *what was scheduled*, but it is a device
 * artifact — wiped on reinstall, capped at 64 on iOS — whereas the schedule is
 * the same answer on any device and at any moment. It is also the only way to
 * answer "what is due today" for a weekday, which the OS would express as a
 * repeating trigger with no notion of "today".
 *
 * Deliberately not "what is due now": the point of the list is to show the whole
 * day so the user can look ahead, so every dose of every active medicine is
 * returned whether or not its time has passed.
 */
export function todayDoses(medicines: Medicine[]): ScheduledDose[] {
    const today = new Date().getDay();
    const doses: ScheduledDose[] = [];

    for (const medicine of medicines) {
        if (!isActiveToday(medicine)) continue;
        // A day left out of `days` is a day it is not taken, so a medicine whose
        // week does not include today contributes nothing at all.
        if (!daysOf(medicine).includes(today)) continue;

        for (const time of timesOf(medicine)) {
            const normalized = parseTime(time);
            if (normalized === null) continue;
            doses.push({ medicine, time: normalized });
        }
    }

    // Sorted by clock time across *all* medicines, which is what makes this read
    // as a day's schedule rather than a list of medicines. Zero-padded "HH:mm"
    // sorts lexicographically in the same order it occurs, so no Date is needed.
    return doses.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

/**
 * Create the reminder channel. Android only, and a no-op elsewhere.
 *
 * Called before the permission check because on Android 13+ the system will not
 * even show the notification permission prompt until the app has at least one
 * channel — asking first would silently get nowhere.
 */
async function ensureChannel(): Promise<void> {
    if (api === null || Platform.OS !== "android") return;
    await api.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
        name: "Medicine reminders",
        importance: api.AndroidImportance.HIGH,
        // On Android 8+ the *channel* decides the sound, so this is the setting
        // that actually plays it — the copy on `content` is what iOS reads.
        sound: REMINDER_SOUND,
    });
}

/**
 * Whether reminders may be posted, asking once if the user has not decided.
 *
 * A refusal is respected rather than worked around: `canAskAgain` is checked so
 * a user who said no is not prompted on every launch, and the caller simply
 * schedules nothing. The feature degrades to "no reminders", which is the user's
 * answer, not an error state to report.
 */
async function ensurePermission(): Promise<boolean> {
    if (api === null) return false;
    const current = await api.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const requested = await api.requestPermissionsAsync();
    return requested.granted;
}

/**
 * Make the OS's pending reminders match the given medicines.
 *
 * `enabled` is the user's master switch, and it is expressed as *emptying the
 * desired set* rather than as an early return. Switching reminders off therefore
 * cancels what is already scheduled, through exactly the same diff that removes
 * a finished course — one code path, so "off" cannot leave a stale reminder
 * behind the way a second, parallel cancellation routine eventually would.
 *
 * Best-effort by contract: it never throws, because it is called from the data
 * layer's effects and a scheduling failure — a denied permission, an OS that
 * refuses the request — must not be able to disturb the medicine list it was
 * derived from. The next successful call reconciles whatever was missed, which
 * is why the diff is against the OS queue rather than an in-memory idea of it.
 *
 * Idempotent: an identifier that already exists is left untouched, so this is
 * safe to run on every launch and after every add.
 */
export async function syncMedicineReminders(
    medicines: Medicine[],
    enabled = true,
): Promise<void> {
    // Nothing to schedule *with* — see `loadNotificationsApi`. Also covers web,
    // where expo-notifications has no scheduling: reminders are a phone feature,
    // so they simply do not exist there.
    if (api === null) return;

    try {
        const desired = new Map(
            (enabled ? buildReminderRequests(medicines) : []).map((request) => [
                request.identifier as string,
                request,
            ]),
        );

        // The permission prompt is asked for only when there is something to
        // schedule. A fresh install with no medicines, or a user who has just
        // switched reminders off, has nothing to ask *for* — prompting there
        // would spend the one ask on a question with no answer, and a refusal
        // could not be undone from inside the app.
        if (desired.size > 0) {
            await ensureChannel();
            if (!(await ensurePermission())) return;
        }

        const scheduled = await api.getAllScheduledNotificationsAsync();
        for (const request of scheduled) {
            const identifier = request.identifier;
            // Anything without the prefix is not ours to cancel.
            if (!isMedicineReminder(identifier)) continue;

            if (desired.has(identifier)) {
                // Already correct. Dropped from `desired` so the loop below
                // schedules only what is genuinely missing — re-creating it
                // would be a cancel-and-schedule on every single launch.
                desired.delete(identifier);
                continue;
            }

            // No longer wanted: the course ended, or the medicine changed.
            await api.cancelScheduledNotificationAsync(identifier);
        }

        for (const request of desired.values()) {
            await api.scheduleNotificationAsync(request);
        }
    } catch {
        // Deliberately swallowed — see the contract above.
    }
}

/**
 * The identifier of the test notification.
 *
 * Deliberately *not* the reminder prefix, and that is the whole point of naming
 * it here: reconciliation cancels every notification carrying `REMINDER_PREFIX`
 * that is not in the desired set, so a test notification wearing that prefix
 * would be swept away as unwanted on the next sync — quite possibly in the
 * seconds before it was due to fire. It is also stable rather than unique per
 * tap, so tapping twice replaces the pending test instead of queueing two.
 */
const TEST_REMINDER_ID = "test:reminder-sound";

/** How long the test waits, in seconds. Long enough to leave the app. */
const TEST_REMINDER_DELAY_SECONDS = 5;

/**
 * The outcome of the development-only sound test.
 *
 * A result rather than a throw, and rather than silence. `syncMedicineReminders`
 * swallows its failures by contract, because a user's medicine list must not be
 * disturbed by a scheduling error; a *test* that swallowed them the same way
 * would be a button that does nothing and says nothing, which is exactly the
 * confusion it exists to remove. Returning the reason makes the failure legible
 * without a stack trace, since these are all conditions the caller already
 * understands — a denied permission, a module that cannot load.
 */
export type TestReminderResult =
    | { scheduled: true }
    | { scheduled: false; reason: string };

/**
 * Post one reminder a few seconds from now, to hear the sound.
 *
 * Development only — the caller gates it on `__DEV__` so it cannot reach a
 * production build. The reason it is worth having: a real dose is a repeating
 * trigger at a time of day, so checking a new voice clip would otherwise mean
 * waiting for that clock time, or adding a throwaway medicine for the next
 * minute. This is the same notification the scheduler would post, five seconds
 * out.
 *
 * Same *deliberately*: same channel, same sound, same shape of content. A test
 * on its own channel, or with `"default"`, would pass while the real reminders
 * stayed silent — worse than no test at all.
 *
 * Two things to know when reading the result:
 *
 * - **Android pins a channel's sound when the channel is created.** If the clip
 *   was replaced after `REMINDER_CHANNEL_ID` was first made, the old sound is
 *   what plays and this still reports success. Reinstalling the app is what
 *   clears that.
 * - **A notification arriving while the app is open** goes through
 *   `configureForegroundHandler`, so it is a banner plus the sound. Leaving the
 *   app first is what exercises the delivery path a real reminder takes.
 */
export async function scheduleTestReminder(): Promise<TestReminderResult> {
    if (api === null) {
        return {
            scheduled: false,
            reason:
                Platform.OS === "android"
                    ? "Reminders cannot load in Expo Go on Android — this needs a development build."
                    : "Reminders are not available on this platform.",
        };
    }

    try {
        // The same order as the real sync, and for the same reason: on Android
        // 13+ the system will not show the permission prompt until the app has
        // at least one channel.
        await ensureChannel();
        if (!(await ensurePermission())) {
            return {
                scheduled: false,
                reason: "OwnMed is not allowed to send notifications. Enable them in system settings.",
            };
        }

        await api.scheduleNotificationAsync({
            identifier: TEST_REMINDER_ID,
            content: {
                title: "Test reminder",
                body: "If you can hear your voice clip, the reminder sound is wired up.",
                sound: REMINDER_SOUND,
            },
            // A one-shot timer rather than a repeating one, so nothing is left
            // pending afterwards. Both platforms support this shape — Android
            // through `timeInterval`, iOS through `UNTimeIntervalNotificationTrigger`
            // — and the short interval is fine because the 60-second minimum iOS
            // imposes applies only to repeating triggers.
            trigger: {
                type: api.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: TEST_REMINDER_DELAY_SECONDS,
                repeats: false,
                // Ignored by iOS, and the only way Android learns which channel
                // — and therefore which sound — to use.
                channelId: REMINDER_CHANNEL_ID,
            },
        });

        return { scheduled: true };
    } catch (error) {
        // Unlike the sync path: a real failure here is the answer the caller is
        // asking for, so it is reported rather than logged and dropped.
        return {
            scheduled: false,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Show reminders while the app is open, as a banner and a sound.
 *
 * Without a handler, `expo-notifications` suppresses a notification that arrives
 * while the app is foregrounded — so the one moment a user is most likely to be
 * looking at the app is the moment a reminder would silently not appear. A
 * medicine reminder is time-sensitive enough to interrupt for, hence a banner
 * rather than a quiet entry in the list.
 */
export function configureForegroundHandler(): void {
    if (api === null) return;
    api.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
        }),
    });
}

/**
 * Call `onReminder` when the user taps a medicine reminder.
 *
 * A wrapper rather than a direct `addNotificationResponseReceivedListener` call
 * at the mount site, for the same reason as everything above: the root layout
 * must not import `expo-notifications` itself, or the app cannot start where the
 * package refuses to load. Where reminders do not exist there is nothing to
 * listen for, so the returned subscription is a no-op — the caller's cleanup
 * runs unconditionally and does not need to know which case it is in.
 */
export function addReminderTapListener(onReminder: () => void): {
    remove: () => void;
} {
    if (api === null) return { remove: () => {} };

    return api.addNotificationResponseReceivedListener((response) => {
        if (isMedicineReminder(response.notification.request.identifier)) {
            onReminder();
        }
    });
}
