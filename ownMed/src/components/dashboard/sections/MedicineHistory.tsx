import { useMemo, useState } from "react";
import {
    Clock,
    History,
    Pill,
    Stethoscope,
    Tablets,
    UserRound,
} from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useAppData } from "@/context/AppDataContext";
import {
    daysLabel,
    daysOf,
    endedOnOf,
    formatDate,
    frequencyLabel,
    mealTimingLabel,
    mealTimingOf,
    startedOnOf,
    timesOf,
    todayISO,
} from "@/lib/medicineSchedule";
import { brand, useAppTheme } from "@/theme";

import type { Medicine } from "../types";

/**
 * How the history is ordered.
 *
 * "recent" is the log order — the array is already newest-first, since
 * `addMedicine` prepends and the server returns rows by `createdAt desc`.
 * "doctor" regroups the same records under whoever prescribed them, which is
 * how people actually look for a medicine: they remember the doctor's name
 * long after they have forgotten the date.
 */
type SortMode = "recent" | "doctor";

const SORT_MODES: { id: SortMode; label: string; icon: typeof Clock }[] = [
    { id: "recent", label: "Newest first", icon: Clock },
    { id: "doctor", label: "By doctor", icon: Stethoscope },
];

/**
 * The groups, in the order they are shown. `doctorName` doubles as the group
 * key: trimmed to "", it is exactly the "no prescriber recorded" group.
 */
type Group = {
    key: string;
    title: string;
    subtitle: string;
    items: Medicine[];
};

/** One medicine card — the same record in both sort modes. */
function MedicineCard({
    medicine,
    today,
    showDoctor,
}: {
    medicine: Medicine;
    today: string;
    /** Redundant when the group heading already names the doctor. */
    showDoctor: boolean;
}) {
    const { colors } = useAppTheme();

    const endedOn = endedOnOf(medicine);
    const ended = endedOn !== "" && endedOn < today;
    const prescriber = medicine.doctorName !== "" || medicine.specialty !== "";
    const mealTiming = mealTimingOf(medicine);

    return (
        <View className="rounded-3xl border border-border bg-surface p-4">
            <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 flex-row items-center gap-3">
                    <View className="h-10 w-10 items-center justify-center rounded-2xl bg-brand-600/10">
                        <Pill color={brand[600]} size={18} strokeWidth={2} />
                    </View>
                    <View className="flex-1">
                        <Text className="text-base font-semibold text-foreground">
                            {medicine.name || "Unnamed medicine"}
                        </Text>
                        <View className="mt-0.5 flex-row items-center gap-1.5">
                            <Tablets color={colors.muted} size={12} strokeWidth={2} />
                            <Text className="text-xs font-sans text-muted">
                                {medicine.dosage || "No dosage"}
                            </Text>
                        </View>
                    </View>
                </View>

                <View
                    className={`rounded-full px-2.5 py-1 ${
                        ended ? "bg-surface-muted" : "bg-brand-600/10"
                    }`}
                >
                    <Text
                        className={`text-xs font-semibold ${
                            ended ? "text-muted" : "text-brand-700"
                        }`}
                    >
                        {ended ? `Ended ${formatDate(endedOn)}` : "Ongoing"}
                    </Text>
                </View>
            </View>

            {showDoctor && prescriber ? (
                <View className="mt-3 flex-row items-center gap-1.5">
                    <Stethoscope color={colors.muted} size={13} strokeWidth={2} />
                    <Text className="flex-1 text-xs font-sans text-muted">
                        {[medicine.doctorName, medicine.specialty]
                            .filter((part) => part !== "")
                            .join(" · ")}
                    </Text>
                </View>
            ) : null}

            <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3">
                <Text className="text-xs font-sans text-muted">
                    {frequencyLabel(timesOf(medicine).length)}
                </Text>
                <Text className="text-xs font-sans text-muted">
                    {daysLabel(daysOf(medicine).length)}
                </Text>
                {/* Only shown when recorded — a medicine with no meal relation
                    says nothing here rather than "Not recorded", which would be
                    noise on every over-the-counter entry. */}
                {mealTiming !== "" ? (
                    <Text className="text-xs font-sans text-muted">
                        {mealTimingLabel(mealTiming)}
                    </Text>
                ) : null}
                <Text className="text-xs font-sans text-muted">
                    Started {formatDate(startedOnOf(medicine))}
                </Text>
            </View>
        </View>
    );
}

export default function MedicineHistory() {
    const { colors } = useAppTheme();
    const { medicines } = useAppData();
    const today = todayISO();
    const [sort, setSort] = useState<SortMode>("recent");

    const groups = useMemo<Group[]>(() => {
        if (sort === "recent") {
            return [{ key: "all", title: "", subtitle: "", items: medicines }];
        }

        const byDoctor = new Map<string, Medicine[]>();
        for (const medicine of medicines) {
            const key = medicine.doctorName.trim();
            const existing = byDoctor.get(key);
            if (existing) existing.push(medicine);
            else byDoctor.set(key, [medicine]);
        }

        // Named doctors alphabetically, so the order does not shuffle as
        // medicines are added. The unnamed group is deliberately not part of
        // that sort — it is a fallback bucket, not a doctor, so it goes last.
        const named = [...byDoctor.entries()]
            .filter(([key]) => key !== "")
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, items]) => ({
                key,
                title: key,
                // Usually one specialty per doctor; deduped so a medicine filed
                // under a different spelling doesn't repeat it.
                subtitle: [
                    ...new Set(
                        items
                            .map((m) => m.specialty.trim())
                            .filter((s) => s !== ""),
                    ),
                ].join(", "),
                items,
            }));

        const noDoctor = byDoctor.get("");
        if (noDoctor) {
            named.push({
                key: "",
                title: "No doctor recorded",
                subtitle: "Added without a prescriber",
                items: noDoctor,
            });
        }

        return named;
    }, [medicines, sort]);

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            className="flex-1"
        >
            <View className="px-6 pt-6">
                <Text className="text-2xl font-display-bold text-foreground">
                    Medicine History
                </Text>
                <Text className="mt-1 text-sm font-sans text-muted">
                    Every medicine you have added.
                </Text>

                {medicines.length === 0 ? (
                    <View className="mt-6 items-center gap-2 rounded-3xl border border-dashed border-border bg-surface px-4 py-10">
                        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/10">
                            <History color={colors.muted} size={24} strokeWidth={2} />
                        </View>
                        <Text className="text-sm font-semibold text-foreground">
                            No medicines added yet
                        </Text>
                        <Text className="text-center text-xs font-sans text-muted">
                            Add one from Add Medicine and it will show up here.
                        </Text>
                    </View>
                ) : (
                    <>
                        <View className="mt-5 flex-row gap-1 rounded-2xl border border-border bg-surface p-1">
                            {SORT_MODES.map(({ id, label, icon: Icon }) => {
                                const active = sort === id;
                                return (
                                    <Pressable
                                        key={id}
                                        onPress={() => setSort(id)}
                                        className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${
                                            active ? "bg-brand-600" : ""
                                        }`}
                                    >
                                        <Icon
                                            color={active ? "#ffffff" : colors.muted}
                                            size={15}
                                            strokeWidth={2}
                                        />
                                        <Text
                                            className={`text-sm ${
                                                active
                                                    ? "font-semibold text-white"
                                                    : "font-sans text-muted"
                                            }`}
                                        >
                                            {label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {groups.map((group) => (
                            <View key={group.key || "no-doctor"} className="mt-6">
                                {group.title !== "" ? (
                                    <View className="mb-3 flex-row items-center gap-2.5">
                                        <View className="h-9 w-9 items-center justify-center rounded-2xl bg-surface-muted">
                                            <UserRound
                                                color={colors.muted}
                                                size={16}
                                                strokeWidth={2}
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-base font-semibold text-foreground">
                                                {group.title}
                                            </Text>
                                            {group.subtitle !== "" ? (
                                                <Text className="text-xs font-sans text-muted">
                                                    {group.subtitle}
                                                </Text>
                                            ) : null}
                                        </View>
                                        <Text className="text-xs font-sans text-muted">
                                            {group.items.length}{" "}
                                            {group.items.length === 1
                                                ? "medicine"
                                                : "medicines"}
                                        </Text>
                                    </View>
                                ) : null}

                                <View className="gap-3">
                                    {group.items.map((medicine) => (
                                        <MedicineCard
                                            key={medicine.id}
                                            medicine={medicine}
                                            today={today}
                                            // The heading already names the
                                            // doctor, so repeating it on every
                                            // card would only be noise.
                                            showDoctor={sort === "recent"}
                                        />
                                    ))}
                                </View>
                            </View>
                        ))}
                    </>
                )}
            </View>
        </ScrollView>
    );
}
