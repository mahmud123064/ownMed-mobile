import {
    Activity,
    Bell,
    Calendar,
    Droplets,
    Heart,
    Pill,
    Upload,
    Weight,
} from "lucide-react-native";

import type {
    ActivityItem,
    Appointment,
    Doctor,
    FamilyMember,
    HealthStat,
    Hospital,
    Medicine,
    Pharmacy,
    UserProfile,
} from "./types";

export const MOCK_USER: UserProfile = {
    name: "Rahim Uddin",
    role: "Patient",
    email: "rahim@example.com",
    phone: "+880 1712-345678",
    avatar: null,
};

export const HEALTH_SUMMARY: HealthStat[] = [
    {
        id: "hr",
        label: "Heart rate",
        value: "72",
        unit: "bpm",
        status: "normal",
        icon: Heart,
        accent: "#dc2626",
    },
    {
        id: "bp",
        label: "Blood pressure",
        value: "120/80",
        unit: "mmHg",
        status: "normal",
        icon: Activity,
        accent: "#0284c7",
    },
    {
        id: "glucose",
        label: "Glucose",
        value: "98",
        unit: "mg/dL",
        status: "normal",
        icon: Droplets,
        accent: "#16a34a",
    },
    {
        id: "weight",
        label: "Weight",
        value: "68",
        unit: "kg",
        status: "normal",
        icon: Weight,
        accent: "#7c3aed",
    },
];

export const RECENT_ACTIVITY: ActivityItem[] = [
    {
        id: "1",
        title: "Medicine reminder",
        subtitle: "Took Paracetamol 500mg",
        time: "2h ago",
        icon: Pill,
    },
    {
        id: "2",
        title: "Appointment booked",
        subtitle: "Dr. Farhana Islam — Cardiology",
        time: "Yesterday",
        icon: Calendar,
    },
    {
        id: "3",
        title: "Prescription uploaded",
        subtitle: "2 images added",
        time: "2d ago",
        icon: Upload,
    },
    {
        id: "4",
        title: "Health tip",
        subtitle: "Stay hydrated through the day",
        time: "3d ago",
        icon: Bell,
    },
];

export const MEDICINES: Medicine[] = [
    {
        id: "1",
        name: "Paracetamol 500mg",
        dosage: "1 tablet",
        frequency: "Twice daily",
        time: "08:00, 20:00",
    },
    {
        id: "2",
        name: "Amlodipine 5mg",
        dosage: "1 tablet",
        frequency: "Once daily",
        time: "09:00",
    },
    {
        id: "3",
        name: "Metformin 500mg",
        dosage: "1 tablet",
        frequency: "Twice daily",
        time: "10:00, 22:00",
    },
];

export const DOCTORS: Doctor[] = [
    {
        id: "1",
        name: "Dr. Farhana Islam",
        department: "Cardiology",
        hospital: "Square Hospital",
        rating: 4.9,
        available: true,
        slots: ["10:00", "11:30", "15:00"],
    },
    {
        id: "2",
        name: "Dr. Tanvir Ahmed",
        department: "Cardiology",
        hospital: "Apollo Dhaka",
        rating: 4.7,
        available: false,
        slots: [],
    },
    {
        id: "3",
        name: "Dr. Nusrat Jahan",
        department: "Dermatology",
        hospital: "Labaid",
        rating: 4.8,
        available: true,
        slots: ["12:00", "16:30"],
    },
    {
        id: "4",
        name: "Dr. Kamal Hossain",
        department: "Orthopedics",
        hospital: "United Hospital",
        rating: 4.6,
        available: true,
        slots: ["09:30", "14:00"],
    },
];

export const PHARMACIES: Pharmacy[] = [
    {
        id: "1",
        name: "Lazz Pharma — Dhanmondi",
        distance: "0.4 km",
        open: true,
        rating: 4.5,
    },
    {
        id: "2",
        name: "MediCare Pharmacy",
        distance: "1.2 km",
        open: true,
        rating: 4.3,
    },
    {
        id: "3",
        name: "Wellness Drug House",
        distance: "2.0 km",
        open: false,
        rating: 4.1,
    },
];

export const HOSPITALS: Hospital[] = [
    {
        id: "1",
        name: "Square Hospital",
        distance: "3.1 km",
        departments: ["Cardiology", "Neurology", "Orthopedics"],
        rating: 4.8,
    },
    {
        id: "2",
        name: "Apollo Dhaka",
        distance: "5.4 km",
        departments: ["Cardiology", "Oncology"],
        rating: 4.7,
    },
    {
        id: "3",
        name: "United Hospital",
        distance: "7.0 km",
        departments: ["General", "Pediatrics"],
        rating: 4.6,
    },
];

export const APPOINTMENTS: Appointment[] = [
    {
        id: "1",
        doctor: "Dr. Farhana Islam",
        department: "Cardiology",
        date: "26 Sep 2026",
        time: "11:30",
        status: "upcoming",
    },
    {
        id: "2",
        doctor: "Dr. Nusrat Jahan",
        department: "Dermatology",
        date: "18 Sep 2026",
        time: "12:00",
        status: "completed",
    },
    {
        id: "3",
        doctor: "Dr. Tanvir Ahmed",
        department: "Cardiology",
        date: "10 Sep 2026",
        time: "15:00",
        status: "cancelled",
    },
];

export const FAMILY_MEMBERS: FamilyMember[] = [
    {
        id: "1",
        name: "Salma Begum",
        relation: "Mother",
        age: 58,
        healthStatus: "Diabetes under control",
        status: "stable",
    },
    {
        id: "2",
        name: "Abdul Karim",
        relation: "Father",
        age: 64,
        healthStatus: "Blood pressure elevated",
        status: "attention",
    },
];
