import { router } from "expo-router";
import {
    Bell,
    ChevronRight,
    RefreshCw,
    SunMoon,
    User,
    type LucideIcon,
} from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppData } from "@/context/AppDataContext";
import { remindersSupported } from "@/lib/notifications";
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

    /**
     * Only a guest sees the synchronise button at the bottom. Syncing is not an
     * action of its own here — it happens as part of signing in, where the local
     * snapshot is pushed to `/sync` — so the button exists to take a guest to
     * that screen. A signed-in user is already synced, and would gain nothing
     * from it.
     *
     * Gated on `hydrated` too, so a remembered session doesn't flash the button
     * during the moment before `authUser` is read back from storage.
     */
    const showSync = hydrated && !authUser;

    // A constant for the life of the process, so it is read once here rather
    // than inside the row where it would be easy to mistake for state.
    const supportsReminders = remindersSupported();

    const items: SettingItem[] = [
        {
            id: "profile",
            icon: User,
            label: "Profile",
            // The profile page is the dashboard's `profile` section, not a
            // route of its own (see `sections.ts`), so this opens it there.
            onPress: () =>
                router.navigate({
                    pathname: "/dashboard",
                    params: { section: "profile" },
                }),
        },
        {
            id: "theme",
            icon: SunMoon,
            label: "Theme",
            value: isDark ? "Dark" : "Light",
            onPress: toggleColorScheme,
        },
        // The master switch for medicine reminders. It reads as a value row like
        // Theme rather than a `Switch`, because a row that both states its value
        // and is tappable anywhere is the same shape the rest of this list
        // already uses — one gesture, one target, no small control to hit. Off
        // cancels every scheduled dose; see `syncMedicineReminders`.
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

                    {/* "Unavailable" is a real state and not a placeholder:
                        Expo Go on Android cannot load the notifications module.
                        Saying so here keeps the row from reading as a broken
                        toggle — reminders work in any real build of the app. */}
                    {!supportsReminders ? (
                        <Text className="mt-3 px-1 text-xs font-sans text-muted">
                            Add Medicine to get reminders. 
                        </Text>
                    ) : null}
                </View>

                {/* A guest's data is on this device only until they sign in, so
                    the action that fixes that gets a full-width primary button
                    rather than a row in the list above. */}
                {showSync ? (
                    <View className="px-6 pt-8">
                        <Pressable
                            onPress={() => router.navigate("/sign-in")}
                            android_ripple={{
                                color: "rgba(255,255,255,0.14)",
                            }}
                            accessibilityRole="button"
                            className="flex-row items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4"
                        >
                            <RefreshCw
                                color="#ffffff"
                                size={18}
                                strokeWidth={2.5}
                            />
                            <Text className="text-base font-semibold text-white">
                                Synchronise
                            </Text>
                        </Pressable>
                        <Text className="mt-2 text-center text-xs font-sans text-muted">
                            Sign in to back up your medicines and family details
                            to your account, so they’re safe on a new phone.
                        </Text>
                    </View>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}
