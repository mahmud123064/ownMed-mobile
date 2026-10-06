import { Check, Minus } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";

import { WEEK_DAYS, daysLabel, daysOf, endedOnOf, formatDate, startedOnOf } from "@/lib/medicineSchedule";
import { brand, useAppTheme } from "@/theme";

import type { Medicine } from "../types";

/** Fixed column widths — the table scrolls horizontally rather than squeezing. */
const NAME_COL = 150;
const DAY_COL = 44;
const COUNT_COL = 78;

/**
 * Which days of the week each medicine is taken, as a matrix: one row per
 * medicine, one column per weekday, and a tick on every day it is due. The last
 * column is the weekly count, so "how many days a week" is readable without
 * counting ticks.
 */
export default function MedicineWeekTable({
    medicines,
}: {
    medicines: Medicine[];
}) {
    const { colors } = useAppTheme();

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
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                    {/* Header */}
                    <View className="flex-row items-center border-b border-border bg-surface-muted px-3 py-2">
                        <View style={{ width: NAME_COL }}>
                            <Text className="text-[10px] font-sans uppercase text-muted">
                                Medicine
                            </Text>
                        </View>
                        {WEEK_DAYS.map((day) => (
                            <View
                                key={day.value}
                                style={{ width: DAY_COL }}
                                className="items-center"
                            >
                                <Text className="text-[10px] font-sans uppercase text-muted">
                                    {day.short}
                                </Text>
                            </View>
                        ))}
                        <View
                            style={{ width: COUNT_COL }}
                            className="items-center"
                        >
                            <Text className="text-[10px] font-sans uppercase text-muted">
                                Per week
                            </Text>
                        </View>
                    </View>

                    {/* One row per medicine */}
                    {medicines.map((medicine, index) => {
                        const days = daysOf(medicine);
                        const endedOn = endedOnOf(medicine);
                        return (
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
                                        Started {formatDate(startedOnOf(medicine))}
                                    </Text>
                                    <Text
                                        numberOfLines={1}
                                        className="text-xs font-sans text-muted"
                                    >
                                        {endedOn === ""
                                            ? "Ongoing"
                                            : `Ends ${formatDate(endedOn)}`}
                                    </Text>
                                </View>

                                {WEEK_DAYS.map((day) => (
                                    <View
                                        key={day.value}
                                        style={{ width: DAY_COL }}
                                        className="items-center"
                                    >
                                        {days.includes(day.value) ? (
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
                                ))}

                                <View
                                    style={{ width: COUNT_COL }}
                                    className="items-center"
                                >
                                    <Text className="text-sm font-semibold text-foreground">
                                        {daysLabel(days.length)}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>
        </View>
    );
}
