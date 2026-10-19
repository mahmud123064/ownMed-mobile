import { Link } from "expo-router";
import { ChevronRight, HeartPulse } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CORE_TASKS, TABS } from "@/lib/guide";
import { brand, useAppTheme } from "@/theme";

/**
 * The graphical user manual — an icon-led guide to the tabs and the main
 * actions, reachable any time from the tab bar rather than only once during
 * onboarding. Each "Getting started" card doubles as a shortcut into the
 * dashboard section where that action happens.
 */
export default function HowToUseScreen() {
    const { colors } = useAppTheme();

    return (
        <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 32 }}
            >
                {/* Header */}
                <View className="px-6 pt-4">
                    <Text className="mt-2 text-3xl font-display-bold text-foreground">
                        How to use
                    </Text>
                    <Text className="mt-1 text-base font-sans text-muted">
                        A quick guide to OwnMed&apos;s tabs and main actions.
                    </Text>
                </View>

                {/* Your tabs */}
                <View className="px-6 pt-6">
                    <Text className="text-lg font-semibold text-foreground">
                        Your tabs
                    </Text>
                    <Text className="mt-1 text-sm font-sans text-muted">
                        Everything you need lives in these five tabs.
                    </Text>
                    <View className="mt-4 gap-3">
                        {TABS.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <View
                                    key={tab.label}
                                    className="flex-row items-center gap-3 rounded-3xl border border-border bg-surface p-4"
                                >
                                    <View className="h-11 w-11 items-center justify-center rounded-2xl bg-brand-600/10">
                                        <Icon
                                            color={brand[600]}
                                            size={22}
                                            strokeWidth={2}
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-base font-semibold text-foreground">
                                            {tab.label}
                                        </Text>
                                        <Text className="mt-0.5 text-sm leading-snug font-sans text-muted">
                                            {tab.description}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </View>

                {/* Getting started */}
                <View className="px-6 pt-8">
                    <Text className="text-lg font-semibold text-foreground">
                        Getting started
                    </Text>
                    <Text className="mt-1 text-sm font-sans text-muted">
                        Tap a card to go straight to that part of the app.
                    </Text>
                    <View className="mt-4 gap-3">
                        {CORE_TASKS.map((task) => {
                            const Icon = task.icon;
                            return (
                                <Link
                                    key={task.id}
                                    href={{
                                        pathname: "/dashboard",
                                        params: { section: task.section },
                                    }}
                                    asChild
                                >
                                    <Pressable className="flex-row items-center gap-3 rounded-3xl border border-border bg-surface p-4">
                                        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-brand-600/10">
                                            <Icon
                                                color={brand[600]}
                                                size={22}
                                                strokeWidth={2}
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-base font-semibold text-foreground">
                                                {task.label}
                                            </Text>
                                            <Text className="mt-0.5 text-sm leading-snug font-sans text-muted">
                                                {task.description}
                                            </Text>
                                        </View>
                                        <ChevronRight
                                            color={colors.muted}
                                            size={20}
                                            strokeWidth={2}
                                        />
                                    </Pressable>
                                </Link>
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
                            This app is for general wellness and information
                            only, and is not a substitute for professional
                            medical advice.
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
