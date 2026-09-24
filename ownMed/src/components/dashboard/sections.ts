import type { ComponentType } from "react";
import {
    Building2,
    Calendar,
    LayoutDashboard,
    Pill,
    Stethoscope,
    Store,
    Upload,
    User,
    Users,
} from "lucide-react-native";

import type { Section, SectionId } from "./types";

import AddMedicine from "./sections/AddMedicine";
import Appointments from "./sections/Appointments";
import FamilyMembers from "./sections/FamilyMembers";
import FindDoctor from "./sections/FindDoctor";
import FindHospital from "./sections/FindHospital";
import FindPharmacy from "./sections/FindPharmacy";
import Overview from "./sections/Overview";
import Profile from "./sections/Profile";
import UploadPrescription from "./sections/UploadPrescription";

export const SECTIONS: Section[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "profile", label: "Profile", icon: User },
    { id: "add-medicine", label: "Add Medicine", icon: Pill },
    { id: "upload-prescription", label: "Upload Prescription", icon: Upload },
    { id: "find-doctor", label: "Find Doctor", icon: Stethoscope },
    { id: "find-pharmacy", label: "Find Pharmacy", icon: Store },
    { id: "find-hospital", label: "Find Hospital", icon: Building2 },
    { id: "appointments", label: "My Appointments", icon: Calendar },
    { id: "family", label: "Family Member Status", icon: Users },
];

export const SECTION_COMPONENTS: Record<SectionId, ComponentType> = {
    overview: Overview,
    profile: Profile,
    "add-medicine": AddMedicine,
    "upload-prescription": UploadPrescription,
    "find-doctor": FindDoctor,
    "find-pharmacy": FindPharmacy,
    "find-hospital": FindHospital,
    appointments: Appointments,
    family: FamilyMembers,
};
