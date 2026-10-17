import { useMemo, useState } from "react";
import { HeartPulse, type LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import NotificationBell from "@/components/ui/NotificationBell";
import {
    TIP_CATEGORIES,
    TIPS,
    tipsForCategory,
    tipOfTheDay,
    type TipCategoryId,
} from "@/lib/healthTips";
import { brand } from "@/theme";

/** "All" plus the four category filters. */
type TipFilter = "all" | TipCategoryId;

/** Hex → rgba with a soft 12% alpha, for tinted icon badges. */
function tint(hex: string, alpha = 0.14): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * One chip in the filter bar — icon, name and how many tips it holds.
 *
 * Built here rather than reusing `Chip`, which is label-only and serves the
 * gender / blood-group rows; a chip carrying an icon and a count would have to
 * widen that component for no benefit to its existing callers.
 */
function FilterChip({
    label,
    count,
    icon: Icon,
    accent,
    active,
    onPress,
}: {
    label: string;
    count: number;
    icon: LucideIcon;
    accent: string;
    active: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`flex-row items-center gap-1.5 rounded-2xl border px-3 py-2 ${
                active
                    ? "border-brand-600 bg-brand-600/10"
                    : "border-border bg-surface"
            }`}
        >
            <Icon
                color={active ? brand[600] : accent}
                size={16}
                strokeWidth={2}
            />
            <Text
                className={`text-sm ${
                    active
                        ? "font-semibold text-brand-700"
                        : "font-sans text-muted"
                }`}
            >
                {label}
            </Text>
            <Text
                className={`text-xs ${
                    active
                        ? "font-semibold text-brand-700"
                        : "font-sans text-muted"
                }`}
            >
                {count}
            </Text>
        </Pressable>
    );
}

export default function HealthTipsScreen() {
    // Rotate the featured "Tip of the Day" by calendar date.
    const featured = useMemo(() => tipOfTheDay(), []);
    // "All" first, so the tab still opens on the full list.
    const [filter, setFilter] = useState<TipFilter>("all");

    const FeaturedIcon = featured.icon;
    const visibleTips = filter === "all" ? TIPS : tipsForCategory(filter);

    return (
        <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 32 }}
            >
                {/* Header */}
                <View className="flex-row items-start justify-between gap-3 px-6 pt-4">
                    <View className="flex-1">
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
                    <NotificationBell />
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

                {/* Tip cards, filtered by area. */}
                <View className="pt-6">
                    <View className="px-6">
                        <Text className="text-lg font-semibold text-foreground">
                            Build your routine
                        </Text>
                        <Text className="mt-1 text-sm font-sans text-muted">
                            Pick an area, or browse them all.
                        </Text>
                    </View>

                    {/* Filter bar. Scrolls edge to edge (`-mx-6` + matching
                        inner padding) so the next chip is visible rather than
                        clipped at the margin, which is what invites the swipe. */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        className="-mx-6 mt-3"
                        contentContainerStyle={{
                            paddingHorizontal: 24,
                            gap: 8,
                        }}
                    >
                        <FilterChip
                            label="All"
                            count={TIPS.length}
                            icon={HeartPulse}
                            accent={brand[600]}
                            active={filter === "all"}
                            onPress={() => setFilter("all")}
                        />
                        {TIP_CATEGORIES.map((category) => (
                            <FilterChip
                                key={category.id}
                                label={category.label}
                                count={tipsForCategory(category.id).length}
                                icon={category.icon}
                                accent={category.accent}
                                active={filter === category.id}
                                onPress={() => setFilter(category.id)}
                            />
                        ))}
                    </ScrollView>

                    <View className="mt-4 gap-3 px-6">
                        {visibleTips.map((tip) => {
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
