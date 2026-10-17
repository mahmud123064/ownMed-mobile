import { useEffect, useState } from "react";
import { Link } from "expo-router";
import {
    Activity,
    ChevronRight,
    HeartPulse,
    Pill,
    ShieldCheck,
    Upload,
    Users,
    type LucideIcon,
} from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { SectionId } from "@/components/dashboard/types";
import NotificationBell from "@/components/ui/NotificationBell";
import { useAppData } from "@/context/AppDataContext";
import { bmi, bmiCategory } from "@/lib/health";
import { tipOfTheDay } from "@/lib/healthTips";
import { todayDoses } from "@/lib/notifications";
import { loadMedicines } from "@/lib/storage";
import { brand } from "@/theme";

type Feature = {
    id: string;
    icon: LucideIcon;
    title: string;
    description: string;
    accent: string;
    /** Which dashboard section this card deep-links to. */
    section: SectionId;
};

const FEATURES: Feature[] = [
    {
        id: "medicine",
        icon: Pill,
        title: "Medicine reminders",
        description: "Never miss a dose with smart reminders.",
        accent: "#0284c7",
        section: "add-medicine",
    },
    {
        id: "prescription",
        icon: Upload,
        title: "Prescriptions",
        description: "Upload and store prescriptions safely.",
        accent: "#7c3aed",
        section: "reports",
    },
    {
        id: "overview",
        icon: Activity,
        title: "Health overview",
        description: "See your vitals at a glance.",
        accent: "#16a34a",
        section: "overview",
    },
    {
        id: "family",
        icon: Users,
        title: "Family health",
        description: "Monitor your loved ones' wellbeing.",
        accent: "#0d9488",
        section: "family",
    },
];

/** Hex → rgba with a soft alpha, for tinted icon badges. */
function tint(hex: string, alpha = 0.14): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function HomeScreen() {
    const { authUser, hydrated, medicines, healthProfile } = useAppData();
    const signedIn = authUser !== null;
    const firstName = (authUser?.name ?? "").trim().split(/\s+/)[0];
    // Rotates by calendar day, matching the Health Tips tab.
    const tip = tipOfTheDay();
    const TipIcon = tip.icon;

    /**
     * How many doses today holds, or null before the first read.
     *
     * Read from **storage**, not from the `medicines` in context: while a family
     * member is linked the on-screen list is *theirs*, while this tile speaks for
     * the day on this device — the same reason `NotificationBell` reads its own
     * copy. `medicines` is in the dependencies purely to re-run the read after an
     * add, a sign-in or a family link; the storage has been written by then.
     */
    const [doseCount, setDoseCount] = useState<number | null>(null);

    useEffect(() => {
        if (!hydrated) return;
        let cancelled = false;

        void loadMedicines()
            .then((own) => {
                if (!cancelled) setDoseCount(todayDoses(own).length);
            })
            .catch(() => {
                // Unreadable storage reads as "nothing to show" rather than
                // leaving the tile looking like it is still loading forever.
                if (!cancelled) setDoseCount(0);
            });

        return () => {
            cancelled = true;
        };
    }, [hydrated, medicines]);

    // Null profile (nothing loaded yet) and missing measurements both land on
    // the same empty state — neither is a number worth inventing.
    const bmiValue =
        healthProfile === null
            ? null
            : bmi(healthProfile.heightCm, healthProfile.weightKg);
    const bmiBand = bmiValue === null ? null : bmiCategory(bmiValue);

    return (
        <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 32 }}
            >
                {/* Header */}
                <View className="flex-row items-center justify-between px-6 pt-4">
                    <View className="flex-row items-center gap-2.5">
                        <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-600">
                            <HeartPulse
                                color="#ffffff"
                                size={20}
                                strokeWidth={2}
                            />
                        </View>
                        <Text className="text-xl font-display-bold text-foreground">
                            OwnMed
                        </Text>
                    </View>
                    <View className="flex-row items-center gap-3">
                        <NotificationBell />
                        {!signedIn ? (
                            <Link href="/sign-in" asChild>
                                <Pressable className="rounded-full border border-border bg-surface px-4 py-2">
                                    <Text className="text-sm font-semibold text-foreground">
                                        Sign in
                                    </Text>
                                </Pressable>
                            </Link>
                        ) : null}
                    </View>
                </View>

                {/* Hero */}
                <View className="px-6 pt-6">
                    <View className="relative overflow-hidden rounded-4xl bg-brand-600 px-6 py-8">
                        <View className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-brand-400/30" />
                        <View className="absolute -bottom-14 -left-8 h-36 w-36 rounded-full bg-brand-800/30" />
                        <View className="self-start rounded-full bg-white/20 px-3 py-1">
                            <Text className="text-xs font-semibold text-white">
                                {signedIn
                                    ? "Signed in"
                                    : "Your health companion"}
                            </Text>
                        </View>
                        <Text className="mt-4 text-3xl leading-tight font-display-bold text-white">
                            {signedIn
                                ? `Welcome back, ${firstName}`
                                : "Take control of your medication & health"}
                        </Text>
                        <Text className="mt-3 text-base leading-relaxed font-sans text-brand-50">
                            {signedIn
                                ? "Track your medicines, see your BMI, and look after your family's health."
                                : "Track medicines, book appointments, and look after your family — all in one place."}
                        </Text>
                        <View className="mt-6 flex-row gap-3">
                            {signedIn ? (
                                <Link href="/dashboard" asChild>
                                    <Pressable className="rounded-2xl bg-white px-5 py-3.5">
                                        <Text className="text-base font-semibold text-brand-700">
                                            Go to dashboard
                                        </Text>
                                    </Pressable>
                                </Link>
                            ) : (
                                <>
                                    <Link href="/sign-up" asChild>
                                        <Pressable className="rounded-2xl bg-white px-5 py-3.5">
                                            <Text className="text-base font-semibold text-brand-700">
                                                Get started
                                            </Text>
                                        </Pressable>
                                    </Link>
                                    <Link href="/sign-in" asChild>
                                        <Pressable className="rounded-2xl border border-white/40 px-5 py-3.5">
                                            <Text className="text-base font-semibold text-white">
                                                Sign in
                                            </Text>
                                        </Pressable>
                                    </Link>
                                </>
                            )}
                        </View>
                    </View>
                </View>

                {/* Today at a glance — the two facts this device already knows,
                    so the page answers "where do I stand?" before it advertises
                    anything. */}
                <View className="px-6 pt-8">
                    <Text className="text-lg font-semibold text-foreground">
                        Today
                    </Text>
                    <Text className="mt-1 text-sm font-sans text-muted">
                        A quick look at your day.
                    </Text>
                    <View className="mt-4 flex-row justify-between">
                        <Link
                            href={{
                                pathname: "/dashboard",
                                params: { section: "add-medicine" },
                            }}
                            asChild
                        >
                            <Pressable className="w-[47%] rounded-3xl border border-border bg-surface p-4">
                                <View
                                    className="h-11 w-11 items-center justify-center rounded-2xl"
                                    style={{ backgroundColor: tint("#0284c7") }}
                                >
                                    <Pill
                                        color="#0284c7"
                                        size={22}
                                        strokeWidth={2}
                                    />
                                </View>
                                <Text className="mt-3 text-xs font-medium text-muted">
                                    Doses today
                                </Text>
                                <Text className="mt-0.5 text-2xl font-display-bold text-foreground">
                                    {doseCount === null ? "—" : doseCount}
                                </Text>
                                <Text className="mt-0.5 text-xs leading-snug font-sans text-muted">
                                    {doseCount === null
                                        ? "Checking your schedule"
                                        : doseCount === 0
                                          ? "No medicines yet"
                                          : doseCount === 1
                                            ? "1 dose scheduled"
                                            : `${doseCount} doses scheduled`}
                                </Text>
                            </Pressable>
                        </Link>

                        <Link
                            href={{
                                pathname: "/dashboard",
                                params: { section: "overview" },
                            }}
                            asChild
                        >
                            <Pressable className="w-[47%] rounded-3xl border border-border bg-surface p-4">
                                <View
                                    className="h-11 w-11 items-center justify-center rounded-2xl"
                                    style={{ backgroundColor: tint("#16a34a") }}
                                >
                                    <Activity
                                        color="#16a34a"
                                        size={22}
                                        strokeWidth={2}
                                    />
                                </View>
                                <Text className="mt-3 text-xs font-medium text-muted">
                                    BMI
                                </Text>
                                <Text className="mt-0.5 text-2xl font-display-bold text-foreground">
                                    {bmiValue === null
                                        ? "—"
                                        : bmiValue.toFixed(1)}
                                </Text>
                                <Text className="mt-0.5 text-xs leading-snug font-sans text-muted">
                                    {bmiBand === null
                                        ? "Add your details"
                                        : bmiBand.label}
                                </Text>
                            </Pressable>
                        </Link>
                    </View>
                </View>

                {/* Features */}
                <View className="px-6 pt-8">
                    <Text className="text-lg font-semibold text-foreground">
                        What you can do
                    </Text>
                    <Text className="mt-1 text-sm font-sans text-muted">
                        Everything you need to manage your health.
                    </Text>
                    <View className="mt-4 flex-row flex-wrap justify-between gap-y-3">
                        {FEATURES.map((feature) => {
                            const Icon = feature.icon;
                            return (
                                <Link
                                    key={feature.id}
                                    href={{
                                        pathname: "/dashboard",
                                        params: { section: feature.section },
                                    }}
                                    asChild
                                >
                                    <Pressable className="w-[47%] rounded-3xl border border-border bg-surface p-4">
                                        <View
                                            className="h-11 w-11 items-center justify-center rounded-2xl"
                                            style={{
                                                backgroundColor: tint(
                                                    feature.accent,
                                                ),
                                            }}
                                        >
                                            <Icon
                                                color={feature.accent}
                                                size={22}
                                                strokeWidth={2}
                                            />
                                        </View>
                                        <Text className="mt-3 text-base font-semibold text-foreground">
                                            {feature.title}
                                        </Text>
                                        <Text className="mt-1 text-xs leading-snug font-sans text-muted">
                                            {feature.description}
                                        </Text>
                                    </Pressable>
                                </Link>
                            );
                        })}
                    </View>
                </View>

                {/* Wellness tip — rotates by calendar day, matching Health Tips. */}
                <View className="px-6 pt-8">
                    <Link href="/health-tips" asChild>
                        <Pressable className="flex-row items-center gap-3 rounded-3xl bg-surface-muted px-4 py-4">
                            <View
                                className="h-10 w-10 items-center justify-center rounded-xl"
                                style={{ backgroundColor: tint(tip.accent) }}
                            >
                                <TipIcon
                                    color={tip.accent}
                                    size={20}
                                    strokeWidth={2}
                                />
                            </View>
                            <View className="flex-1">
                                <Text className="text-sm font-semibold text-foreground">
                                    Daily wellness tip
                                </Text>
                                <Text className="mt-0.5 text-xs font-sans text-muted">
                                    {tip.title} — {tip.description}
                                </Text>
                            </View>
                            <ChevronRight
                                color={brand[600]}
                                size={20}
                                strokeWidth={2}
                            />
                        </Pressable>
                    </Link>
                </View>

                {/* Trust */}
                <View className="px-6 pt-8">
                    <View className="flex-row items-center gap-3 rounded-3xl border border-border bg-surface p-4">
                        <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10">
                            <ShieldCheck
                                color={brand[600]}
                                size={20}
                                strokeWidth={2}
                            />
                        </View>
                        <View className="flex-1">
                            <Text className="text-sm font-semibold text-foreground">
                                Private & secure
                            </Text>
                            <Text className="mt-0.5 text-xs font-sans text-muted">
                                Your health data stays yours. Built with
                                privacy in mind.
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Footer disclaimer */}
                <View className="px-6 pt-8">
                    <Text className="text-center text-xs leading-relaxed font-sans text-muted">
                        This app is for general wellness and information only,
                        and is not a substitute for professional medical advice.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
