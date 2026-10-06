import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react-native";
import { Text, TextInput, View, type TextInputProps } from "react-native";

import { brand, status, useAppTheme } from "@/theme";

export type FormFieldProps = {
    label: string;
    icon: LucideIcon;
    error?: string;
    right?: ReactNode;
} & TextInputProps;

/**
 * Labelled input with a leading icon and a shared focus / error treatment:
 * the border and icon highlight on focus, and turn red when there's an error.
 */
export default function FormField({
    label,
    icon: Icon,
    error,
    right,
    onFocus,
    onBlur,
    ...inputProps
}: FormFieldProps) {
    const { colors } = useAppTheme();
    const [focused, setFocused] = useState(false);

    const border = error
        ? "border-danger"
        : focused
          ? "border-brand-600"
          : "border-border";
    const iconColor = error
        ? status.danger
        : focused
          ? brand[600]
          : colors.muted;

    return (
        <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">
                {label}
            </Text>
            <View
                className={[
                    "flex-row items-center gap-3 rounded-2xl border bg-surface px-4",
                    border,
                ].join(" ")}
            >
                <Icon color={iconColor} size={20} strokeWidth={2} />
                <TextInput
                    {...inputProps}
                    onFocus={(e) => {
                        setFocused(true);
                        onFocus?.(e);
                    }}
                    onBlur={(e) => {
                        setFocused(false);
                        onBlur?.(e);
                    }}
                    placeholderTextColor={colors.muted}
                    className="flex-1 py-3 text-base text-foreground"
                />
                {right}
            </View>
            {error ? (
                <Text
                    style={{ color: status.danger }}
                    className="font-sans text-xs"
                >
                    {error}
                </Text>
            ) : null}
        </View>
    );
}
