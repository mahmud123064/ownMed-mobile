import type { LucideIcon } from "lucide-react-native";

export type SectionId =
    | "overview"
    | "profile"
    | "add-medicine"
    | "upload-prescription"
    | "find-doctor"
    | "find-pharmacy"
    | "find-hospital"
    | "appointments"
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
    frequency: string;
    time: string;
};

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
    name: string;
    role: string;
    email: string;
    phone: string;
    avatar: string | null;
};
