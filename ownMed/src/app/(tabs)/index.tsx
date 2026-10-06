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

import { brand } from "@/theme";

type Feature = {
    id: string;
    icon: LucideIcon;
    title: string;
    description: string;
    accent: string;
};

const FEATURES: Feature[] = [
    {
        id: "medicine",
        icon: Pill,
        title: "Medicine reminders",
        description: "Never miss a dose with smart reminders.",
        accent: "#0284c7",
    },
    {
        id: "prescription",
        icon: Upload,
        title: "Prescriptions",
        description: "Upload and store prescriptions safely.",
        accent: "#7c3aed",
    },
    {
        id: "overview",
        icon: Activity,
        title: "Health overview",
        description: "See your vitals at a glance.",
        accent: "#16a34a",
    },
    {
        id: "family",
        icon: Users,
        title: "Family health",
        description: "Monitor your loved ones' wellbeing.",
        accent: "#0d9488",
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
                    <Link href="/sign-in" asChild>
                        <Pressable className="rounded-full border border-border bg-surface px-4 py-2">
                            <Text className="text-sm font-semibold text-foreground">
                                Sign in
                            </Text>
                        </Pressable>
                    </Link>
                </View>

                {/* Hero */}
                <View className="px-6 pt-6">
                    <View className="relative overflow-hidden rounded-4xl bg-brand-600 px-6 py-8">
                        <View className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-brand-400/30" />
                        <View className="absolute -bottom-14 -left-8 h-36 w-36 rounded-full bg-brand-800/30" />
                        <View className="self-start rounded-full bg-white/20 px-3 py-1">
                            <Text className="text-xs font-semibold text-white">
                                Your health companion
                            </Text>
                        </View>
                        <Text className="mt-4 text-3xl leading-tight font-display-bold text-white">
                            Take control of your medication & health
                        </Text>
                        <Text className="mt-3 text-base leading-relaxed font-sans text-brand-50">
                            Track medicines, book appointments, and look after
                            your family — all in one place.
                        </Text>
                        <View className="mt-6 flex-row gap-3">
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
                        </View>
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
                                    href="/dashboard"
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

                {/* Wellness tip */}
                <View className="px-6 pt-8">
                    <Link href="/health-tips" asChild>
                        <Pressable className="flex-row items-center gap-3 rounded-3xl bg-surface-muted px-4 py-4">
                            <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10">
                                <HeartPulse
                                    color={brand[600]}
                                    size={20}
                                    strokeWidth={2}
                                />
                            </View>
                            <View className="flex-1">
                                <Text className="text-sm font-semibold text-foreground">
                                    Daily wellness tip
                                </Text>
                                <Text className="mt-0.5 text-xs font-sans text-muted">
                                    Sip water through the day — aim for about 8
                                    glasses.
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
