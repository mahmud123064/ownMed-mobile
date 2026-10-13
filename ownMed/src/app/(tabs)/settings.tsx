import { useState } from "react";
import { router } from "expo-router";
import {
    Bell,
    ChevronRight,
    Languages,
    RefreshCw,
    SunMoon,
    User,
    Volume2,
    type LucideIcon,
} from "lucide-react-native";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppData } from "@/context/AppDataContext";
import { remindersSupported, scheduleTestReminder } from "@/lib/notifications";
import { brand, useAppTheme } from "@/theme";

type SettingItem = {
    id: string;
    icon: LucideIcon;
    label: string;
    value?: string;
    onPress?: () => void;
};

export default function SettingsScreen() {
    const { isDark, colors, toggleColorScheme } = useAppTheme();
    const { hydrated, authUser, notificationsEnabled, setNotificationsEnabled } =
        useAppData();
    const [language, setLanguage] = useState<"English" | "Bangla">("English");

    /**
     * Only a guest sees this row. Syncing is not an action of its own here —
     * it happens as part of signing in, where the local snapshot is pushed to
     * `/sync` — so it exists to take a guest to that screen. A signed-in user
     * is already synced, and would gain nothing from it.
     *
     * Gated on `hydrated` too, so a remembered session doesn't flash the row
     * during the moment before `authUser` is read back from storage.
     */
    const showSync = hydrated && !authUser;

    // A constant for the life of the process, so it is read once here rather
    // than inside the row where it would be easy to mistake for state.
    const supportsReminders = remindersSupported();

    /**
     * Development only: post one reminder five seconds from now, so a new voice
     * clip can be heard without waiting for a real dose time. See
     * `scheduleTestReminder` for why it reports its outcome instead of
     * swallowing it, and why a channel that already has a sound may ignore a
     * replacement clip.
     *
     * The alert is the whole interface. A test that only worked, or only failed,
     * silently would be indistinguishable from the button not being wired up.
     */
    const testReminderSound = () => {
        void scheduleTestReminder().then((result) => {
            Alert.alert(
                result.scheduled
                    ? "Test reminder scheduled"
                    : "Test reminder failed",
                result.scheduled
                    ? "It will arrive in a few seconds. Leave the app to hear it the way a real reminder arrives."
                    : result.reason,
            );
        });
    };

    const items: SettingItem[] = [
        { id: "profile", icon: User, label: "Profile" },
        ...(showSync
            ? [
                  {
                      id: "sync",
                      icon: RefreshCw,
                      label: "Synchronise",
                      onPress: () => router.navigate("/sign-in"),
                  },
              ]
            : []),
        {
            id: "theme",
            icon: SunMoon,
            label: "Theme",
            value: isDark ? "Dark" : "Light",
            onPress: toggleColorScheme,
        },
        // The master switch for medicine reminders. It reads as a value row like
        // Theme and Language rather than a `Switch`, because a row that both
        // states its value and is tappable anywhere is the same shape the rest of
        // this list already uses — one gesture, one target, no small control to
        // hit. Off cancels every scheduled dose; see `syncMedicineReminders`.
        //
        // "Unavailable" is a real state and not a placeholder: Expo Go on
        // Android cannot load the notifications module at all, so the honest
        // answer there is that the switch has nothing behind it.
        {
            id: "notifications",
            icon: Bell,
            label: "Medicine reminders",
            value: !supportsReminders
                ? "Unavailable"
                : notificationsEnabled
                  ? "On"
                  : "Off",
            onPress: supportsReminders
                ? () => setNotificationsEnabled(!notificationsEnabled)
                : undefined,
        },
        // Development only, and deliberately *not* gated on `supportsReminders`
        // the way the row above is: the state most worth being able to poke at
        // is the one where reminders cannot load at all, so tapping this has to
        // report the reason rather than the row quietly not being there.
        ...(__DEV__
            ? [
                  {
                      id: "test-sound",
                      icon: Volume2,
                      label: "Test reminder sound",
                      // Sits where the other rows state their value, so it reads
                      // as a dev tool rather than a real preference.
                      value: "Dev only",
                      onPress: testReminderSound,
                  },
              ]
            : []),
        {
            id: "language",
            icon: Languages,
            label: "Language",
            value: language,
            onPress: () =>
                setLanguage((prev) =>
                    prev === "English" ? "Bangla" : "English",
                ),
        },
        // {
        //   id: 'signin',
        //   icon: LogIn,
        //   label: 'Sign In',
        //   onPress: () => router.navigate('/sign-in'),
        // },
    ];

    return (
        <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 32 }}
            >
                {/* Header */}
                <View className="px-6 pt-4">
                    <View className="flex-row items-center gap-2">
                        {/* <SunMoon
                            color={brand[500]}
                            size={20}
                            strokeWidth={2.2}
                        /> */}
                        {/* <Text className="text-sm font-semibold uppercase tracking-wider text-brand-600">
                            Preferences
                        </Text> */}
                    </View>
                    <Text className="mt-2 text-3xl font-display-bold text-foreground">
                        Settings
                    </Text>
                    <Text className="mt-1 text-base font-sans text-muted">
                        Manage your account and app preferences.
                    </Text>
                </View>

                {/* Settings list */}
                <View className="px-6 pt-5">
                    <View className="overflow-hidden rounded-3xl border border-border bg-surface">
                        {items.map((item, index) => {
                            const Icon = item.icon;
                            const row = (
                                <>
                                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10">
                                        <Icon
                                            color={brand[600]}
                                            size={20}
                                            strokeWidth={2}
                                        />
                                    </View>
                                    <Text className="flex-1 text-base font-semibold text-foreground">
                                        {item.label}
                                    </Text>
                                    {item.value ? (
                                        <Text className="text-sm font-sans text-muted">
                                            {item.value}
                                        </Text>
                                    ) : null}
                                    <ChevronRight
                                        color={colors.muted}
                                        size={20}
                                        strokeWidth={2}
                                    />
                                </>
                            );

                            const isLast = index === items.length - 1;

                            return item.onPress ? (
                                <Pressable
                                    key={item.id}
                                    onPress={item.onPress}
                                    android_ripple={{
                                        color: "rgba(0,0,0,0.06)",
                                    }}
                                    className={[
                                        "flex-row items-center gap-4 px-4 py-4",
                                        !isLast && "border-b border-border",
                                    ].join(" ")}
                                >
                                    {row}
                                </Pressable>
                            ) : (
                                <View
                                    key={item.id}
                                    className={[
                                        "flex-row items-center gap-4 px-4 py-4",
                                        !isLast && "border-b border-border",
                                    ].join(" ")}
                                >
                                    {row}
                                </View>
                            );
                        })}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
