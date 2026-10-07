import type { LucideIcon } from "lucide-react-native";

export type SectionId =
    | "overview"
    | "profile"
    | "add-medicine"
    | "medicine-history"
    | "family";

export type Section = {
    id: SectionId;
    label: string;
    icon: LucideIcon;
};

export type HealthStat = {
    id: string;
    label: string;
    value: string;
    unit: string;
    status: "normal" | "warning" | "danger";
    icon: LucideIcon;
    accent: string;
};

export type ActivityItem = {
    id: string;
    title: string;
    subtitle: string;
    time: string;
    icon: LucideIcon;
};

export type Medicine = {
    id: string;
    name: string;
    dosage: string;
    /**
     * Scheduled reminder times, as 24h "HH:mm" strings, sorted ascending and
     * unique. Frequency is *derived* from this (`times.length`) rather than
     * stored, so a medicine can never claim a dose count its schedule
     * contradicts.
     */
    times: string[];
    /**
     * Weekdays the medicine is taken, as `Date.getDay()` values (0=Sun..6=Sat),
     * sorted ascending. A weekday left out is a day it is *not* taken.
     */
    days: number[];
    /**
     * The calendar date the medicine was started, "YYYY-MM-DD" in local time —
     * a date rather than an instant, so it is stored as a plain string.
     */
    startedOn: string;
    /**
     * The date the course ends, same shape as `startedOn`. An empty string means
     * the course is **ongoing** — which is the norm for a chronic medicine, so
     * this is a real state and not a missing value.
     */
    endedOn: string;
    /**
     * Who prescribed it; "" when nobody did — an over-the-counter medicine is a
     * normal case, so this is optional rather than required.
     */
    doctorName: string;
    /** The prescribing doctor's specialty, e.g. "Cardiology"; "" when unknown. */
    specialty: string;
    /**
     * Whether it is taken before or after food; "" when it has no meal relation
     * or none was recorded. Optional rather than required for the same reason as
     * `doctorName` — plenty of medicines are neither, and the form must be able
     * to record them.
     */
    mealTiming: MealTiming;
};

/** When a medicine is taken relative to food. "" = not recorded. */
export type MealTiming = "before" | "after" | "";

export type Doctor = {
    id: string;
    name: string;
    department: string;
    hospital: string;
    rating: number;
    available: boolean;
    slots: string[];
};

export type Pharmacy = {
    id: string;
    name: string;
    distance: string;
    open: boolean;
    rating: number;
};

export type Hospital = {
    id: string;
    name: string;
    distance: string;
    departments: string[];
    rating: number;
};

export type Appointment = {
    id: string;
    doctor: string;
    department: string;
    date: string;
    time: string;
    status: "upcoming" | "completed" | "cancelled";
};

export type FamilyMember = {
    id: string;
    name: string;
    relation: string;
    age: number;
    healthStatus: string;
    status: "stable" | "attention";
};

export type UserProfile = {
    /** Present for users created by the backend; absent for the local mock user. */
    id?: string;
    /**
     * The shareable "Family ID" — a short code a relative can enter to manage
     * this account's medicines and family members. Absent for guests, who have
     * no account to share.
     */
    shareId?: string;
    name: string;
    email: string;
    phone: string;
    /** "male" | "female" | "other"; "" (or absent) when not set. */
    gender?: string;
    /** A blood group label like "O+"; "" (or absent) when not set. */
    bloodGroup?: string;
    /** Date of birth as "YYYY-MM-DD"; "" (or absent) when not set. */
    dateOfBirth?: string;
};
