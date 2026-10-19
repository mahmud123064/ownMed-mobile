import {
    Activity,
    BookOpen,
    FileText,
    HeartPulse,
    House,
    LayoutDashboard,
    Pill,
    Settings,
    Users,
    type LucideIcon,
} from "lucide-react-native";

import type { SectionId } from "@/components/dashboard/types";

/**
 * The "How to use" content — the five tabs and the main actions — shared by the
 * dedicated How to use tab and the onboarding walkthrough's first step, so the
 * two can never list a different tab set.
 *
 * `CORE_TASKS` is typed against the dashboard's `SectionId` union, so each task
 * card can deep-link straight to where that action happens.
 */
export type TabGuide = {
    icon: LucideIcon;
    label: string;
    description: string;
};

export type CoreTask = {
    id: string;
    icon: LucideIcon;
    label: string;
    description: string;
    /** Which dashboard section this card deep-links to. */
    section: SectionId;
};

export const TABS: TabGuide[] = [
    {
        icon: House,
        label: "Home",
        description: "Your landing page with quick actions.",
    },
    {
        icon: LayoutDashboard,
        label: "Dashboard",
        description: "Track medicines, reports, and family health.",
    },
    {
        icon: HeartPulse,
        label: "Health Tips",
        description: "Daily wellness tips and advice.",
    },
    {
        icon: Settings,
        label: "Settings",
        description: "Theme and reminder preferences.",
    },
    {
        icon: BookOpen,
        label: "How to use",
        description: "This guide to the app.",
    },
];

export const CORE_TASKS: CoreTask[] = [
    {
        id: "add-medicine",
        icon: Pill,
        label: "Add a medicine",
        description: "Add the name, dosage, reminder times and days.",
        section: "add-medicine",
    },
    {
        id: "overview",
        icon: Activity,
        label: "See your BMI",
        description: "Add your height and weight to see your BMI.",
        section: "overview",
    },
    {
        id: "family",
        icon: Users,
        label: "Connect a family member",
        description: "Use their Family ID to manage their medicines.",
        section: "family",
    },
    {
        id: "reports",
        icon: FileText,
        label: "Upload a report",
        description: "Store lab results, scans and prescriptions.",
        section: "reports",
    },
];
