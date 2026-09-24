import { useMemo } from "react";
import {
    Activity,
    Apple,
    Brain,
    Droplets,
    Dumbbell,
    HeartPulse,
    Moon,
    Sun,
    Wind,
    type LucideIcon,
} from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { brand } from "@/theme";

type HealthTip = {
    id: string;
    icon: LucideIcon;
    title: string;
    description: string;
    /** Accent hex used for the icon badge tint and icon color. */
    accent: string;
};

const TIPS: HealthTip[] = [
    {
        id: "hydration",
        icon: Droplets,
        title: "Stay hydrated",
        description: "Sip water through the day — aim for about 8 glasses.",
        accent: "#0284c7",
    },
    {
        id: "sleep",
        icon: Moon,
        title: "Sleep well",
        description: "Wind down early for 7–9 hours of restful sleep.",
        accent: "#7c3aed",
    },
    {
        id: "nutrition",
        icon: Apple,
        title: "Eat the rainbow",
        description: "Fill half your plate with colorful fruits and veggies.",
        accent: "#16a34a",
    },
    {
        id: "movement",
        icon: Dumbbell,
        title: "Move daily",
        description: "Get 30 minutes of activity — a brisk walk counts.",
        accent: "#dc2626",
    },
    {
        id: "mind",
        icon: Brain,
        title: "Protect your mind",
        description: "Take breaks, breathe, and practice a little mindfulness.",
        accent: "#f59e0b",
    },
    {
        id: "sunlight",
        icon: Sun,
        title: "Catch the sun",
        description: "Step outside for a dose of vitamin D each morning.",
        accent: "#06c7ab",
    },
    {
        id: "posture",
        icon: Activity,
        title: "Stretch it out",
        description: "Stand and stretch every hour to keep muscles loose.",
        accent: "#0d9488",
    },
    {
        id: "breathe",
        icon: Wind,
        title: "Just breathe",
        description: "Slow, deep breaths calm the nervous system fast.",
        accent: "#4f46e5",
    },
];

/** Hex → rgba with a soft 12% alpha, for tinted icon badges. */
function tint(hex: string, alpha = 0.14): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function HealthTipsScreen() {
    // Rotate the featured "Tip of the Day" by calendar date.
    const featured = useMemo(() => {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const dayOfYear = Math.floor(
            (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
        );
        return TIPS[dayOfYear % TIPS.length];
    }, []);

    const FeaturedIcon = featured.icon;

    return (
        <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 32 }}
            >
                {/* Header */}
                <View className="px-6 pt-4">
                    <View className="flex-row items-center gap-2">
                        {/* <Sparkles
                            color={brand[500]}
                            size={20}
                            strokeWidth={2.2}
                        /> */}
                        {/* <Text className="text-sm font-semibold uppercase tracking-wider text-brand-600">
                            Daily wellness
                        </Text> */}
                    </View>
                    <Text className="mt-2 text-3xl font-display-bold text-foreground">
                        Health Tips
                    </Text>
                    <Text className="mt-1 text-base font-sans text-muted">
                        Small habits, every day, add up to a healthier you.
                    </Text>
                </View>

                {/* Featured tip of the day */}
                <View className="px-6 pt-5">
                    <View className="relative overflow-hidden rounded-4xl bg-brand-600 px-5 py-6">
                        <View className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-brand-400/30" />
                        <View className="absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-brand-800/30" />
                        <View className="flex-row items-center gap-2">
                            <View className="rounded-full bg-white/20 px-3 py-1">
                                <Text className="text-xs font-semibold text-white">
                                    Tip of the day
                                </Text>
                            </View>
                        </View>
                        <View className="mt-4 flex-row items-center gap-4">
                            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                                <FeaturedIcon
                                    color="#ffffff"
                                    size={28}
                                    strokeWidth={2}
                                />
                            </View>
                            <Text className="flex-1 text-xl font-bold leading-snug text-white">
                                {featured.title}
                            </Text>
                        </View>
                        <Text className="mt-3 text-sm leading-relaxed font-sans text-brand-50">
                            {featured.description}
                        </Text>
                    </View>
                </View>

                {/* Tip cards */}
                <View className="px-6 pt-6">
                    <Text className="mb-3 text-lg font-semibold text-foreground">
                        Build your routine
                    </Text>
                    <View className="gap-3">
                        {TIPS.map((tip) => {
                            const Icon = tip.icon;
                            return (
                                <View
                                    key={tip.id}
                                    className="flex-row items-center gap-4 rounded-3xl border border-border bg-surface p-4"
                                >
                                    <View
                                        className="h-14 w-14 items-center justify-center rounded-2xl"
                                        style={{
                                            backgroundColor: tint(tip.accent),
                                        }}
                                    >
                                        <Icon
                                            color={tip.accent}
                                            size={26}
                                            strokeWidth={2}
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-base font-semibold text-foreground">
                                            {tip.title}
                                        </Text>
                                        <Text className="mt-1 text-sm leading-snug font-sans text-muted">
                                            {tip.description}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </View>

                {/* Footer */}
                <View className="px-6 pt-8">
                    <View className="flex-row items-center gap-3 rounded-3xl bg-surface-muted px-4 py-3">
                        <HeartPulse
                            color={brand[600]}
                            size={20}
                            strokeWidth={2}
                        />
                        <Text className="flex-1 text-xs leading-relaxed font-sans text-muted">
                            This content is for general wellness only and is not
                            a substitute for professional medical advice.
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
