import { useRef, useState } from "react";
import { LogOut, Menu, User } from "lucide-react-native";
import {
    Alert,
    Dimensions,
    Image,
    Modal,
    Pressable,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { status, useAppTheme } from "@/theme";

import { MOCK_USER } from "./mock";

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

    const handleLogout = () => {
        setAccountOpen(false);
        Alert.alert("Logout", "Sign out is not wired up yet.");
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
                        {MOCK_USER.name}
                    </Text>
                </View>

                <Pressable
                    ref={avatarRef}
                    onPress={openAccountMenu}
                    hitSlop={8}
                    className="h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-brand-600"
                >
                    {MOCK_USER.avatar ? (
                        <Image
                            source={{ uri: MOCK_USER.avatar }}
                            className="h-full w-full"
                        />
                    ) : (
                        <User color="#ffffff" size={22} strokeWidth={2} />
                    )}
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
                                    {MOCK_USER.name}
                                </Text>
                                <Text className="mt-0.5 text-xs font-sans text-muted">
                                    {MOCK_USER.email}
                                </Text>
                            </View>
                            <View className="h-px bg-border" />
                            <Pressable
                                onPress={handleLogout}
                                className="flex-row items-center gap-2 px-4 py-3"
                            >
                                <LogOut
                                    color={status.danger}
                                    size={16}
                                    strokeWidth={2}
                                />
                                <Text className="text-sm font-semibold text-danger">
                                    Logout
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}