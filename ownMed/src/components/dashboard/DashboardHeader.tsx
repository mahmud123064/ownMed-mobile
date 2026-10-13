import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Bell, Copy, LogIn, LogOut, Menu } from "lucide-react-native";
import {
    Alert,
    Dimensions,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppData } from "@/context/AppDataContext";
import {
    remindersSupported,
    todayDoses,
    type ScheduledDose,
} from "@/lib/notifications";
import { loadMedicines } from "@/lib/storage";
import { brand, status, useAppTheme } from "@/theme";

import { GUEST_USER } from "./mock";

type Props = {
    onMenuPress: () => void;
};

function greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

/**
 * One or two letters standing in for the user's name in the header.
 *
 * First and last word only, so "Rahim Uddin" is "RU" and a three-part name
 * doesn't try to fit three letters in the circle. A single-word name gives one
 * letter, which is the honest answer — inventing a second would be guesswork.
 */
function initialsOf(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    const first = words[0][0];
    const last = words.length > 1 ? words[words.length - 1][0] : "";
    return (first + last).toUpperCase();
}

export default function DashboardHeader({ onMenuPress }: Props) {
    const { colors } = useAppTheme();
    const { authUser, signOut, notificationsEnabled } = useAppData();
    const user = authUser ?? GUEST_USER;
    const insets = useSafeAreaInsets();
    const [accountOpen, setAccountOpen] = useState(false);
    const [anchor, setAnchor] = useState({ top: insets.top + 60, right: 16 });
    const avatarRef = useRef<View>(null);

    /**
     * Today's doses, or null before the first read.
     *
     * Null is a distinct state from an empty list on purpose: "not looked yet"
     * and "nothing scheduled" render the same if they are both `[]`, and the
     * dropdown would claim there is nothing due during the moment it is actually
     * still reading.
     */
    const [doses, setDoses] = useState<ScheduledDose[] | null>(null);
    const [bellOpen, setBellOpen] = useState(false);
    const [bellAnchor, setBellAnchor] = useState({
        top: insets.top + 60,
        right: 16,
    });
    const bellRef = useRef<View>(null);

    const openAccountMenu = () => {
        avatarRef.current?.measureInWindow((x, y, width, height) => {
            const windowWidth = Dimensions.get("window").width;
            setAnchor({
                top: y + height + 8,
                right: windowWidth - (x + width),
            });
            setAccountOpen(true);
        });
    };

    const openBellMenu = () => {
        bellRef.current?.measureInWindow((x, y, width, height) => {
            const windowWidth = Dimensions.get("window").width;
            setBellAnchor({
                top: y + height + 8,
                right: windowWidth - (x + width),
            });
            setBellOpen(true);
        });
    };

    /**
     * Read the schedule when the dropdown opens, not on every render.
     *
     * From **storage** rather than the `medicines` in context, and that is the
     * point: while a family member is linked the on-screen list is *theirs*, but
     * reminders are scheduled from this device's own list, so listing the linked
     * member's medicines here would promise a ring that never comes. Reading on
     * open also keeps a just-added medicine from being missing — the add has
     * already written to storage by the time the sheet is opened.
     */
    useEffect(() => {
        if (!bellOpen) return;
        let cancelled = false;

        void loadMedicines()
            .then((medicines) => {
                if (!cancelled) setDoses(todayDoses(medicines));
            })
            .catch(() => {
                // Unreadable storage reads as "nothing to show" rather than
                // leaving a spinner up forever behind a dismissable sheet.
                if (!cancelled) setDoses([]);
            });

        return () => {
            cancelled = true;
        };
    }, [bellOpen]);

    /**
     * The one line under the list, when there is something to say about whether
     * any of it will actually ring.
     *
     * A schedule is still worth showing when reminders cannot fire — it is what
     * the day holds either way — but showing it silently would let the user
     * conclude the reminders are broken.
     */
    const reminderNote = !remindersSupported()
        ? "Reminders need a development build on Android."
        : !notificationsEnabled
          ? "Reminders are off. Turn them on in Settings."
          : "";

    // Guests have no session to end, so the same menu row offers sign-in.
    const handleAccountAction = () => {
        setAccountOpen(false);
        if (authUser) void signOut();
        router.replace("/sign-in");
    };

    const handleCopyShareId = async () => {
        if (!user.shareId) return;
        try {
            await Clipboard.setStringAsync(user.shareId);
            Alert.alert(
                "Family ID copied",
                "Share it with a family member so they can update your medicines and reports.",
            );
        } catch {
            // A dev client built before expo-clipboard was added has no native
            // module behind this call. Falling back to showing the code beats
            // an unhandled rejection, and the code is selectable anyway.
            Alert.alert(
                "Family ID",
                `${user.shareId}\n\nPress and hold the ID to copy it.`,
            );
        }
    };

    return (
        <>
            <View className="flex-row items-center gap-3 border-b border-border bg-surface px-6 py-4">
                <Pressable
                    onPress={onMenuPress}
                    hitSlop={8}
                    className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface"
                >
                    <Menu color={colors.foreground} size={20} strokeWidth={2} />
                </Pressable>

                <View className="flex-1">
                    <Text className="text-xs font-medium text-muted">
                        {greeting()}
                    </Text>
                    <Text className="text-base font-semibold text-foreground">
                        {user.name}
                    </Text>
                </View>

                <Pressable
                    ref={bellRef}
                    onPress={openBellMenu}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Today's medicine reminders"
                    className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface"
                >
                    <Bell color={colors.foreground} size={20} strokeWidth={2} />
                </Pressable>

                <Pressable
                    ref={avatarRef}
                    onPress={openAccountMenu}
                    hitSlop={8}
                    className="h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-brand-600"
                >
                    <Text className="text-sm font-semibold text-white">
                        {initialsOf(user.name)}
                    </Text>
                </Pressable>
            </View>

            {/* Today's doses, positioned under the bell. This is a *schedule*,
                not a history of delivered notifications: the OS keeps no
                readable record of those once the app has been killed, whereas
                the schedule is the same answer every time it is asked. */}
            <Modal
                transparent
                visible={bellOpen}
                animationType="fade"
                onRequestClose={() => setBellOpen(false)}
            >
                <View className="flex-1">
                    <Pressable
                        className="absolute inset-0"
                        onPress={() => setBellOpen(false)}
                    />
                    <View
                        className="absolute"
                        style={{ top: bellAnchor.top, right: bellAnchor.right }}
                    >
                        <View className="w-72 overflow-hidden rounded-2xl border border-border bg-surface">
                            <View className="px-4 py-3">
                                <Text className="text-sm font-semibold text-foreground">
                                    Today&apos;s medicines
                                </Text>
                                <Text className="mt-0.5 text-xs font-sans text-muted">
                                    {doses === null
                                        ? "Reading your schedule…"
                                        : doses.length === 0
                                          ? "Nothing scheduled for today."
                                          : `${doses.length} ${doses.length === 1 ? "dose" : "doses"} today`}
                                </Text>
                            </View>

                            {doses !== null && doses.length > 0 ? (
                                <>
                                    <View className="h-px bg-border" />
                                    <ScrollView
                                        className="max-h-80"
                                        showsVerticalScrollIndicator={false}
                                    >
                                        {doses.map((dose, index) => (
                                            <View
                                                key={`${dose.medicine.id}:${dose.time}`}
                                                className={[
                                                    "flex-row items-center gap-3 px-4 py-3",
                                                    index < doses.length - 1 &&
                                                        "border-b border-border",
                                                ].join(" ")}
                                            >
                                                <Text className="text-sm font-semibold text-brand-600">
                                                    {dose.time}
                                                </Text>
                                                <View className="flex-1">
                                                    <Text
                                                        numberOfLines={1}
                                                        className="text-sm font-semibold text-foreground"
                                                    >
                                                        {dose.medicine.name.trim() !==
                                                        ""
                                                            ? dose.medicine.name
                                                            : "Medicine"}
                                                    </Text>
                                                    {dose.medicine.dosage.trim() !==
                                                    "" ? (
                                                        <Text
                                                            numberOfLines={1}
                                                            className="mt-0.5 text-xs font-sans text-muted"
                                                        >
                                                            {
                                                                dose.medicine
                                                                    .dosage
                                                            }
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            </View>
                                        ))}
                                    </ScrollView>
                                </>
                            ) : null}

                            {/* The bell keeps showing what the schedule says even
                                when nothing will ring, since that is still what
                                the day holds — but silently, so the reason
                                belongs on screen next to it. */}
                            {reminderNote !== "" ? (
                                <>
                                    <View className="h-px bg-border" />
                                    <Text className="px-4 py-3 text-xs font-sans text-muted">
                                        {reminderNote}
                                    </Text>
                                </>
                            ) : null}
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                transparent
                visible={accountOpen}
                animationType="fade"
                onRequestClose={() => setAccountOpen(false)}
            >
                <View className="flex-1">
                    <Pressable
                        className="absolute inset-0"
                        onPress={() => setAccountOpen(false)}
                    />
                    <View
                        className="absolute"
                        style={{ top: anchor.top, right: anchor.right }}
                    >
                        <View className="w-64 overflow-hidden rounded-2xl border border-border bg-surface ">
                            <View className="px-4 py-3">
                                <Text className="text-sm font-semibold text-foreground">
                                    {user.name}
                                </Text>
                                <Text className="mt-0.5 text-xs font-sans text-muted">
                                    {user.email}
                                </Text>
                            </View>
                            <View className="h-px bg-border" />

                            {/* The Family ID: what the user reads out so a
                                relative can manage their medicines. Guests
                                have no account, so there is no code to show. */}
                            {user.shareId ? (
                                <Pressable
                                    onPress={() => void handleCopyShareId()}
                                    className="flex-row items-center gap-3 px-4 py-3"
                                >
                                    <View className="flex-1">
                                        <Text className="text-xs font-sans text-muted">
                                            Family ID
                                        </Text>
                                        {/* Selectable so the code can be
                                            copied by long-press even where the
                                            clipboard module isn't linked. */}
                                        <Text
                                            selectable
                                            className="mt-0.5 text-sm font-semibold text-foreground"
                                        >
                                            {user.shareId}
                                        </Text>
                                    </View>
                                    <Copy
                                        color={colors.muted}
                                        size={16}
                                        strokeWidth={2}
                                    />
                                </Pressable>
                            ) : (
                                <View className="px-4 py-3">
                                    <Text className="text-xs font-sans text-muted">
                                        Sign in to get a Family ID you can share.
                                    </Text>
                                </View>
                            )}

                            <View className="h-px bg-border" />
                            <Pressable
                                onPress={handleAccountAction}
                                className="flex-row items-center gap-2 px-4 py-3"
                            >
                                {authUser ? (
                                    <>
                                        <LogOut
                                            color={status.danger}
                                            size={16}
                                            strokeWidth={2}
                                        />
                                        <Text className="text-sm font-semibold text-danger">
                                            Logout
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <LogIn
                                            color={brand[600]}
                                            size={16}
                                            strokeWidth={2}
                                        />
                                        <Text className="text-sm font-semibold text-brand-600">
                                            Sign in
                                        </Text>
                                    </>
                                )}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}