import type { ComponentType } from "react";
import {
    LayoutDashboard,
    Pill,
    Upload,
    User,
    Users,
} from "lucide-react-native";

import type { Section, SectionId } from "./types";

import AddMedicine from "./sections/AddMedicine";
import FamilyMembers from "./sections/FamilyMembers";
import Overview from "./sections/Overview";
import Profile from "./sections/Profile";
import UploadPrescription from "./sections/UploadPrescription";

// Find Doctor, Find Pharmacy, Find Hospital, and Appointments are intentionally
// not published in this release. Their components and mock data stay in the
// codebase so they can be re-enabled later.
export const SECTIONS: Section[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "profile", label: "Profile", icon: User },
    { id: "add-medicine", label: "Add Medicine", icon: Pill },
    { id: "upload-prescription", label: "Upload Prescription", icon: Upload },
    { id: "family", label: "Family Member Status", icon: Users },
];

export const SECTION_COMPONENTS: Record<SectionId, ComponentType> = {
    overview: Overview,
    profile: Profile,
    "add-medicine": AddMedicine,
    "upload-prescription": UploadPrescription,
    family: FamilyMembers,
};
