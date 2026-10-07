import type { ComponentType } from "react";
import {
    History,
    LayoutDashboard,
    Pill,
    User,
    Users,
} from "lucide-react-native";

import type { Section, SectionId } from "./types";

import AddMedicine from "./sections/AddMedicine";
import FamilyMembers from "./sections/FamilyMembers";
import MedicineHistory from "./sections/MedicineHistory";
import Overview from "./sections/Overview";
import Profile from "./sections/Profile";

// Find Doctor, Find Pharmacy, Find Hospital, and Appointments are intentionally
// not published in this release. Their components and mock data stay in the
// codebase so they can be re-enabled later.
//
// Prescription upload is not a section of its own: it is the second mode of
// Add Medicine (`UploadPrescription`), since both are ways to add a medicine.
export const SECTIONS: Section[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "profile", label: "Profile", icon: User },
    { id: "add-medicine", label: "Add Medicine", icon: Pill },
    { id: "medicine-history", label: "Medicine History", icon: History },
    { id: "family", label: "Family Member Status", icon: Users },
];

export const SECTION_COMPONENTS: Record<SectionId, ComponentType> = {
    overview: Overview,
    profile: Profile,
    "add-medicine": AddMedicine,
    "medicine-history": MedicineHistory,
    family: FamilyMembers,
};
