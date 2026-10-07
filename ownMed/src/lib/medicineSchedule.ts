import type { MealTiming, Medicine } from "@/components/dashboard/types";

/**
 * Schedule helpers shared by the Add Medicine form and the reminder table.
 *
 * A medicine's schedule is a list of 24h "HH:mm" clock times. Its **frequency
 * is derived** from that list's length rather than stored, so a medicine can
 * never claim a dose count its own schedule contradicts.
 */

/** Suggested times, offered as one-tap chips in the form. */
export const TIME_PRESETS = [
    { key: "morning", label: "Morning", time: "08:00" },
    { key: "afternoon", label: "Afternoon", time: "12:00" },
    { key: "evening", label: "Evening", time: "18:00" },
    { key: "night", label: "Night", time: "22:00" },
] as const;

/**
 * The week's days in display order — Saturday first, matching the Bangladeshi
 * calendar. `value` is `Date.getDay()` (0=Sun..6=Sat), so a stored `days` array
 * stays meaningful against a real date; `short` is only for the UI.
 */
export const WEEK_DAYS = [
    { value: 6, short: "Sat" },
    { value: 0, short: "Sun" },
    { value: 1, short: "Mon" },
    { value: 2, short: "Tue" },
    { value: 3, short: "Wed" },
    { value: 4, short: "Thu" },
    { value: 5, short: "Fri" },
] as const;

/** Every weekday, ascending — the default for a medicine taken daily. */
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * When a medicine can be taken relative to food, in the order the form offers
 * them. Deliberately just these two: they are what a prescription actually says,
 * and a third option nobody uses would only slow the choice down.
 */
export const MEAL_TIMINGS = [
    { value: "before", label: "Before meal" },
    { value: "after", label: "After meal" },
] as const;

/** Today as a local "YYYY-MM-DD" (not UTC — the user's calendar day). */
export function todayISO(): string {
    return isoDate(new Date());
}

/**
 * Whether a string is a real calendar date in "YYYY-MM-DD" form. The round-trip
 * through `Date` catches values the regex alone would accept, like 2026-02-30.
 */
export function isValidDateString(input: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
    const parsed = new Date(`${input}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;
    // A rolled-over date (Feb 30 -> Mar 2) no longer matches its own input.
    return isoDate(parsed) === input;
}

/** "YYYY-MM-DD" for a Date, in local time. */
export function isoDate(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The `Date` for a stored "YYYY-MM-DD", at local midnight.
 *
 * The `T00:00:00` suffix matters: parsing the bare string would be read as UTC,
 * which lands on the previous day for anyone west of Greenwich.
 */
export function parseISODate(iso: string): Date {
    return new Date(`${iso}T00:00:00`);
}

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

/**
 * A stored date as something worth reading, e.g. "2026-10-07" -> "Oct 7, 2026".
 *
 * Hand-rolled rather than `Intl.DateTimeFormat`, whose output varies with the
 * device locale and can differ between the JS engine and Hermes builds. An
 * unrecognized value is returned as-is so a bad record stays visible.
 */
export function formatDate(iso: string): string {
    if (!isValidDateString(iso)) return iso;
    const [, month, day] = iso.split("-");
    return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${iso.slice(0, 4)}`;
}

/** Dedupe and sort weekdays ascending. */
export function sortDays(days: number[]): number[] {
    return [...new Set(days)].sort((a, b) => a - b);
}

/** The short label for a `Date.getDay()` value, e.g. 6 -> "Sat". */
export function dayLabel(value: number): string {
    return WEEK_DAYS.find((day) => day.value === value)?.short ?? "";
}

/**
 * Turn free-form user input into a stored "HH:mm", or null when it is not a
 * real clock time.
 *
 * Deliberately forgiving, since typing a time on a phone keyboard is fiddly:
 * "8", "8:30", "0830", "8pm" and "20:00" all resolve. Anything ambiguous or
 * out of range (e.g. "25:00") is rejected rather than guessed at.
 */
export function parseTime(input: string): string | null {
    const match = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/i.exec(input.trim());
    if (!match) return null;

    const [, rawHours, rawMinutes, meridiem] = match;
    let hours = Number(rawHours);
    const minutes = rawMinutes ? Number(rawMinutes) : 0;
    if (minutes > 59) return null;

    if (meridiem) {
        // 12-hour clock: only 1–12 are meaningful, and 12am/12pm are 0/12.
        if (hours < 1 || hours > 12) return null;
        if (meridiem.toLowerCase() === "pm" && hours !== 12) hours += 12;
        if (meridiem.toLowerCase() === "am" && hours === 12) hours = 0;
    } else if (hours > 23) {
        return null;
    }

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0",
    )}`;
}

/**
 * A medicine's scheduled times, defensively.
 *
 * Records written by an older build (or anything else that reached state
 * without going through `loadMedicines`) can still carry the pre-schedule
 * shape, where there is no `times` key at all. Reading it as `[]` there keeps a
 * single stale record from white-screening the dashboard, and lets the table
 * render it as "nothing scheduled" instead of crashing.
 */
export function timesOf(medicine: Medicine): string[] {
    return Array.isArray(medicine.times) ? medicine.times : [];
}

/**
 * Dedupe and sort ascending. Zero-padded "HH:mm" strings sort
 * lexicographically in the same order they occur in a day.
 */
export function sortTimes(times: string[]): string[] {
    return [...new Set(times)].sort();
}

/** The slot name for an exact preset match, or "" for a custom time. */
export function presetLabel(time: string): string {
    return TIME_PRESETS.find((preset) => preset.time === time)?.label ?? "";
}

/** Every time at which any medicine is scheduled, sorted — the table columns. */
export function unionTimes(medicines: Medicine[]): string[] {
    return sortTimes(medicines.flatMap(timesOf));
}

/** How often a medicine is taken, shown next to its row. */
export function frequencyLabel(dosesPerDay: number): string {
    return `${dosesPerDay}×/day`;
}

/** How many days a week a medicine is taken. */
export function daysLabel(daysPerWeek: number): string {
    return `${daysPerWeek} ${daysPerWeek === 1 ? "day" : "days"}/week`;
}

/**
 * A medicine's weekdays, defensively — see `timesOf`. A record from before the
 * weekly pattern existed was taken every day, so that is the fallback.
 */
export function daysOf(medicine: Medicine): number[] {
    return Array.isArray(medicine.days) ? medicine.days : ALL_DAYS;
}

/** A medicine's start date, defensively; unknown falls back to today. */
export function startedOnOf(medicine: Medicine): string {
    return typeof medicine.startedOn === "string" && medicine.startedOn !== ""
        ? medicine.startedOn
        : todayISO();
}

/**
 * A medicine's end date, defensively — see `timesOf`. Unlike `startedOn` there
 * is no sensible fallback date: an absent or unreadable end date means the
 * course is still running, so the blank string *is* the answer.
 */
export function endedOnOf(medicine: Medicine): string {
    return typeof medicine.endedOn === "string" &&
        isValidDateString(medicine.endedOn)
        ? medicine.endedOn
        : "";
}

/**
 * A medicine's meal timing, defensively — see `timesOf`. Anything that is not
 * one of the two known values reads as "not recorded" rather than being passed
 * through, mirroring how the server normalizes the column on the way out.
 */
export function mealTimingOf(medicine: Medicine): MealTiming {
    return medicine.mealTiming === "before" || medicine.mealTiming === "after"
        ? medicine.mealTiming
        : "";
}

/** How a meal timing reads, e.g. "Before meal"; "" when not recorded. */
export function mealTimingLabel(value: MealTiming): string {
    return MEAL_TIMINGS.find((option) => option.value === value)?.label ?? "";
}

/**
 * Refill blanks in a server-supplied medicine from the device's copy.
 *
 * Medicines synced before a field existed are stored blank — `times` empty, or
 * `startedOn` null — and the sync merge is deliberately add-only, so the device
 * copy is the last record of what the user set. A blank value carries no
 * information worth protecting, so it never overwrites a real one. Only ever
 * fills in gaps: a medicine the server already has a value for is returned
 * untouched.
 *
 * `days` is not recovered: its blank state is the all-7 default, which already
 * means "every day", and since there is no edit path the two copies cannot
 * diverge.
 *
 * `doctorName` / `specialty` are not recovered either, for a different reason:
 * no medicine already on the server can have had a prescriber recorded, since
 * the fields did not exist when it was pushed and there is no edit path to add
 * one — so the device has nothing to refill them from. Anything the device does
 * know is carried by the next push, which sends the whole local list.
 *
 * `mealTiming` is in that same group, for the same reason: a medicine on the
 * server with a NULL timing predates the column, so the device copy is blank
 * too and there is nothing to recover.
 *
 * The recovery is device-local. Until medicines can be updated server-side
 * (the merge has no update path), the server copy stays blank and this runs
 * again on each sign-in.
 */
export function recoverFromLocal(
    fromServer: Medicine[],
    local: Medicine[],
): Medicine[] {
    const byId = new Map(local.map((medicine) => [medicine.id, medicine]));
    return fromServer.map((medicine) => {
        const mine = byId.get(medicine.id);
        if (!mine) return medicine;

        const recovered = { ...medicine };
        if (timesOf(medicine).length === 0 && timesOf(mine).length > 0) {
            recovered.times = timesOf(mine);
        }
        if (medicine.startedOn === "" && mine.startedOn !== "") {
            recovered.startedOn = mine.startedOn;
        }
        // A blank `endedOn` is overwhelmingly the *real* state (ongoing), so
        // this only recovers a date the server dropped for a medicine the
        // device knows has one.
        if (endedOnOf(medicine) === "" && endedOnOf(mine) !== "") {
            recovered.endedOn = endedOnOf(mine);
        }
        return recovered;
    });
}
