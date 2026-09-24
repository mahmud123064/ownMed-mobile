import { useEffect, useState } from "react";
import { X } from "lucide-react-native";
import {
    Animated,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

import { brand, useAppTheme } from "@/theme";

import { MOCK_USER } from "./mock";
import { SECTIONS } from "./sections";
import type { SectionId } from "./types";

type Props = {
    open: boolean;
    active: SectionId;
    onClose: () => void;
    onSelect: (id: SectionId) => void;
};

const DRAWER_WIDTH = 288;

export default function Drawer({ open, active, onClose, onSelect }: Props) {
    const { colors } = useAppTheme();
    const [translateX] = useState(() => new Animated.Value(-DRAWER_WIDTH));
    const [backdrop] = useState(() => new Animated.Value(0));

    useEffect(() => {
        Animated.parallel([
            Animated.timing(translateX, {
                toValue: open ? 0 : -DRAWER_WIDTH,
                duration: 220,
                useNativeDriver: true,
            }),
            Animated.timing(backdrop, {
                toValue: open ? 1 : 0,
                duration: 220,
                useNativeDriver: true,
            }),
        ]).start();
    }, [open, translateX, backdrop]);

    const initials = MOCK_USER.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

    return (
        <View
            pointerEvents={open ? "auto" : "none"}
            className="absolute inset-0"
        >
            {/* Backdrop */}
            <Animated.View style={{ opacity: backdrop }} className="absolute inset-0">
                <Pressable className="flex-1 bg-black/50" onPress={onClose} />
            </Animated.View>

            {/* Panel */}
            <Animated.View
                style={{
                    width: DRAWER_WIDTH,
                    transform: [{ translateX }],
                }}
                className="absolute bottom-0 left-0 top-0 bg-surface"
            >
                <View className="flex-row items-center justify-between border-b border-border px-5 py-5">
                    <View className="flex-row items-center gap-3">
                        <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-600">
                            <Text className="text-sm font-semibold text-white">
                                {initials}
                            </Text>
                        </View>
                        <View>
                            <Text className="text-base font-semibold text-foreground">
                                {MOCK_USER.name}
                            </Text>
                            <Text className="text-xs font-sans text-muted">
                                {MOCK_USER.email}
                            </Text>
                        </View>
                    </View>
                    <Pressable onPress={onClose} hitSlop={8}>
                        <X color={colors.muted} size={20} strokeWidth={2} />
                    </Pressable>
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingVertical: 12 }}
                >
                    {SECTIONS.map((section) => {
                        const Icon = section.icon;
                        const isActive = section.id === active;
                        return (
                            <Pressable
                                key={section.id}
                                onPress={() => onSelect(section.id)}
                                className={[
                                    "mx-2 flex-row items-center gap-3 rounded-2xl px-4 py-3",
                                    isActive ? "bg-brand-600/10" : "",
                                ].join(" ")}
                            >
                                <Icon
                                    color={isActive ? brand[600] : colors.muted}
                                    size={20}
                                    strokeWidth={2}
                                />
                                <Text
                                    className={[
                                        "text-sm",
                                        isActive
                                            ? "font-semibold text-brand-600"
                                            : "font-sans text-foreground",
                                    ].join(" ")}
                                >
                                    {section.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </Animated.View>
        </View>
    );
}
