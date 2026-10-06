import { Check, Minus } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";

import {
    frequencyLabel,
    presetLabel,
    timesOf,
    unionTimes,
} from "@/lib/medicineSchedule";
import { brand, useAppTheme } from "@/theme";

import type { Medicine } from "../types";

/** Fixed column widths — the table scrolls horizontally rather than squeezing. */
const NAME_COL = 150;
const TIME_COL = 62;
const FREQ_COL = 62;

/**
 * The daily schedule as a matrix: one row per medicine, one column per time at
 * which anything is scheduled, and a tick wherever that medicine is due. The
 * last column is the derived frequency, so "how many a day" is readable without
 * counting ticks.
 */
export default function MedicineScheduleTable({
    medicines,
}: {
    medicines: Medicine[];
}) {
    const { colors } = useAppTheme();
    const times = unionTimes(medicines);

    if (medicines.length === 0) {
        return (
            <View className="mt-3 rounded-3xl border border-border bg-surface py-8">
                <Text className="text-center text-sm font-sans text-muted">
                    No medicines yet. Add one above to start tracking it.
                </Text>
            </View>
        );
    }

    return (
        <View className="mt-3 overflow-hidden rounded-3xl border border-border bg-surface">
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                // The parent section already scrolls vertically, so this only
                // ever scrolls sideways — nested vertical scroll views inside
                // one another are a known source of gesture trouble.
            >
                <View>
                    {/* Header */}
                    <View className="flex-row items-center border-b border-border bg-surface-muted px-3 py-2">
                        <View style={{ width: NAME_COL }}>
                            <Text className="text-[10px] font-sans uppercase text-muted">
                                Medicine
                            </Text>
                        </View>
                        {times.map((time) => {
                            const label = presetLabel(time);
                            return (
                                <View
                                    key={time}
                                    style={{ width: TIME_COL }}
                                    className="items-center"
                                >
                                    <View className="h-4 justify-center">
                                        {label ? (
                                            <Text className="text-[10px] font-sans uppercase text-muted">
                                                {label}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <View className="h-6 justify-center">
                                        <Text className="text-sm font-semibold text-foreground">
                                            {time}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                        <View
                            style={{ width: FREQ_COL }}
                            className="items-center"
                        >
                            <View className="h-4 justify-center">
                                <Text className="text-[10px] font-sans uppercase text-muted">
                                    Per day
                                </Text>
                            </View>
                            <View className="h-6" />
                        </View>
                    </View>

                    {/* One row per medicine */}
                    {medicines.map((medicine, index) => (
                        <View
                            key={medicine.id}
                            className={`flex-row items-center px-3 py-3 ${
                                index < medicines.length - 1
                                    ? "border-b border-border"
                                    : ""
                            }`}
                        >
                            <View style={{ width: NAME_COL }} className="pr-2">
                                <Text
                                    numberOfLines={1}
                                    className="text-sm font-semibold text-foreground"
                                >
                                    {medicine.name}
                                </Text>
                                <Text
                                    numberOfLines={1}
                                    className="mt-0.5 text-xs font-sans text-muted"
                                >
                                    {medicine.dosage}
                                </Text>
                            </View>

                            {times.map((time) => {
                                const scheduled =
                                    timesOf(medicine).includes(time);
                                return (
                                    <View
                                        key={time}
                                        style={{ width: TIME_COL }}
                                        className="items-center"
                                    >
                                        {scheduled ? (
                                            <Check
                                                color={brand[600]}
                                                size={18}
                                                strokeWidth={3}
                                            />
                                        ) : (
                                            <Minus
                                                color={colors.muted}
                                                size={16}
                                                strokeWidth={2}
                                            />
                                        )}
                                    </View>
                                );
                            })}

                            <View
                                style={{ width: FREQ_COL }}
                                className="items-center"
                            >
                                <Text className="text-sm font-semibold text-foreground">
                                    {frequencyLabel(timesOf(medicine).length)}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}
