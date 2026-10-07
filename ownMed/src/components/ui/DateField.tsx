import { useState } from "react";
import DateTimePicker, {
    DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { CalendarDays } from "lucide-react-native";
import { Modal, Platform, Pressable, Text, View } from "react-native";

import { formatDate, isoDate, parseISODate } from "@/lib/medicineSchedule";
import { brand, status, useAppTheme } from "@/theme";

export type DateFieldProps = {
    label: string;
    /** A "YYYY-MM-DD" date, or "" for "not set" (shown as `placeholder`). */
    value: string;
    onChange: (value: string) => void;
    /** What an unset value reads as, e.g. "Ongoing". */
    placeholder?: string;
    /** Offer a way back to the unset state, when "" is meaningful. */
    clearable?: boolean;
    /** Earliest selectable date. */
    minimumDate?: Date;
    /** Latest selectable date — e.g. today, for a date of birth. */
    maximumDate?: Date;
    error?: string;
};

/**
 * A calendar date field: tapping it opens the platform's date picker, so the
 * user picks a date instead of typing one.
 *
 * The two platforms want different shapes. Android's picker *is* a dialog, so
 * the library recommends its imperative API — there is no component to mount
 * and no `visible` state to get out of step with the dialog. iOS has no such
 * dialog, so the calendar is rendered inside a modal we control.
 */
export default function DateField({
    label,
    value,
    onChange,
    placeholder = "Select a date",
    clearable = false,
    minimumDate,
    maximumDate,
    error,
}: DateFieldProps) {
    const { colors, isDark } = useAppTheme();
    const [open, setOpen] = useState(false);

    // The pickers need a Date, but this field's value may legitimately be empty.
    // Falling back to the earliest allowed date keeps the calendar opening on a
    // sensible month rather than on an Invalid Date.
    const selected =
        value !== "" ? parseISODate(value) : (minimumDate ?? new Date());

    const commit = (date: Date) => onChange(isoDate(date));

    const openPicker = () => {
        if (Platform.OS === "android") {
            // Dismissal needs no handling: `onValueChange` only fires on a real
            // selection, so closing the dialog without picking changes nothing.
            DateTimePickerAndroid.open({
                value: selected,
                mode: "date",
                display: "calendar",
                minimumDate,
                maximumDate,
                onValueChange: (_event, date) => commit(date),
            });
            return;
        }
        setOpen(true);
    };

    return (
        <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">{label}</Text>
            <Pressable
                onPress={openPicker}
                className={`flex-row items-center gap-3 rounded-2xl border bg-surface px-4 py-3 ${
                    error ? "border-danger" : "border-border"
                }`}
            >
                <CalendarDays
                    color={error ? status.danger : colors.muted}
                    size={20}
                    strokeWidth={2}
                />
                <Text
                    className={`flex-1 text-base ${
                        value === ""
                            ? "font-sans text-muted"
                            : "text-foreground"
                    }`}
                >
                    {value === "" ? placeholder : formatDate(value)}
                </Text>
            </Pressable>
            {error ? (
                <Text
                    style={{ color: status.danger }}
                    className="font-sans text-xs"
                >
                    {error}
                </Text>
            ) : null}

            {/* iOS only — on Android the dialog above is the whole UI. */}
            <Modal
                visible={open}
                transparent
                animationType="fade"
                onRequestClose={() => setOpen(false)}
            >
                <View className="flex-1 items-center justify-center px-6">
                    {/* Backdrop, as a sibling rather than a parent, so tapping
                        the card itself doesn't fall through and close it.
                        Inset via `style` rather than a class: an unrecognized
                        utility would leave a zero-sized tap target. */}
                    <Pressable
                        onPress={() => setOpen(false)}
                        className="bg-black/40"
                        style={{
                            position: "absolute",
                            top: 0,
                            right: 0,
                            bottom: 0,
                            left: 0,
                        }}
                    />
                    <View className="w-full rounded-3xl border border-border bg-surface p-4">
                        <Text className="text-base font-semibold text-foreground">
                            {label}
                        </Text>
                        <View className="mt-1 items-center">
                            <DateTimePicker
                                value={selected}
                                mode="date"
                                display="inline"
                                minimumDate={minimumDate}
                                maximumDate={maximumDate}
                                accentColor={brand[600]}
                                themeVariant={isDark ? "dark" : "light"}
                                // Fires on every tap, so the value tracks the
                                // calendar live; Done only closes the modal.
                                onValueChange={(_event, date) => commit(date)}
                            />
                        </View>
                        <View className="mt-2 flex-row justify-end gap-2">
                            {clearable && value !== "" ? (
                                <Pressable
                                    onPress={() => {
                                        onChange("");
                                        setOpen(false);
                                    }}
                                    className="rounded-2xl border border-border px-4 py-2"
                                >
                                    <Text className="text-sm font-semibold text-muted">
                                        Clear
                                    </Text>
                                </Pressable>
                            ) : null}
                            <Pressable
                                onPress={() => setOpen(false)}
                                className="rounded-2xl bg-brand-600 px-5 py-2"
                            >
                                <Text className="text-sm font-semibold text-white">
                                    Done
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
