import { ScrollView, Text, View } from "react-native";

import { brand } from "@/theme";

import { HEALTH_SUMMARY, RECENT_ACTIVITY } from "../mock";
import type { ActivityItem, HealthStat } from "../types";

/** Hex → rgba with a soft alpha, for tinted icon badges. */
function tint(hex: string, alpha = 0.14): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const DOT_CLASS: Record<HealthStat["status"], string> = {
    normal: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
};

function StatCard({ stat }: { stat: HealthStat }) {
    const Icon = stat.icon;
    return (
        <View className="w-[47%] gap-3 rounded-3xl border border-border bg-surface p-4">
            <View
                className="h-11 w-11 items-center justify-center rounded-2xl"
                style={{ backgroundColor: tint(stat.accent) }}
            >
                <Icon color={stat.accent} size={22} strokeWidth={2} />
            </View>
            <View>
                <View className="flex-row items-baseline gap-1">
                    <Text className="text-xl font-bold text-foreground">
                        {stat.value}
                    </Text>
                    <Text className="text-xs font-sans text-muted">
                        {stat.unit}
                    </Text>
                </View>
                <View className="mt-1 flex-row items-center gap-1.5">
                    <View className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[stat.status]}`} />
                    <Text className="text-xs font-sans text-muted">
                        {stat.label}
                    </Text>
                </View>
            </View>
        </View>
    );
}

function ActivityRow({ item }: { item: ActivityItem }) {
    const Icon = item.icon;
    return (
        <View className="flex-row items-center gap-3 rounded-3xl border border-border bg-surface p-4">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10">
                <Icon color={brand[600]} size={20} strokeWidth={2} />
            </View>
            <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">
                    {item.title}
                </Text>
                <Text className="mt-0.5 text-xs font-sans text-muted">
                    {item.subtitle}
                </Text>
            </View>
            <Text className="text-xs font-sans text-muted">{item.time}</Text>
        </View>
    );
}

export default function Overview() {
    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            className="flex-1"
        >
            <View className="px-6 pt-6">
                <Text className="text-2xl font-display-bold text-foreground">
                    Overview
                </Text>
                <Text className="mt-1 text-sm font-sans text-muted">
                    Your health at a glance.
                </Text>

                <View className="mt-5 flex-row flex-wrap justify-between gap-y-3">
                    {HEALTH_SUMMARY.map((stat) => (
                        <StatCard key={stat.id} stat={stat} />
                    ))}
                </View>

                <Text className="mt-6 text-lg font-semibold text-foreground">
                    Recent activity
                </Text>
                <View className="mt-3 gap-3">
                    {RECENT_ACTIVITY.map((item) => (
                        <ActivityRow key={item.id} item={item} />
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
