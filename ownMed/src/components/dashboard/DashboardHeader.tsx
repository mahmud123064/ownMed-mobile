import { useRef, useState } from "react";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Copy, LogIn, LogOut, Menu } from "lucide-react-native";
import {
    Alert,
    Dimensions,
    Modal,
    Pressable,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppData } from "@/context/AppDataContext";
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
    const { authUser, signOut } = useAppData();
    const user = authUser ?? GUEST_USER;
    const insets = useSafeAreaInsets();
    const [accountOpen, setAccountOpen] = useState(false);
    const [anchor, setAnchor] = useState({ top: insets.top + 60, right: 16 });
    const avatarRef = useRef<View>(null);

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