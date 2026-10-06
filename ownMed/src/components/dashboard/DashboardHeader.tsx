import { useRef, useState } from "react";
import { router } from "expo-router";
import { LogIn, LogOut, Menu, User } from "lucide-react-native";
import {
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
                    <User color="#ffffff" size={22} strokeWidth={2} />
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