import { useState } from "react";
import { Search, Star, Stethoscope } from "lucide-react-native";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { brand, useAppTheme } from "@/theme";

import { DOCTORS } from "../mock";
import type { Doctor } from "../types";

function DoctorCard({ doctor }: { doctor: Doctor }) {
    return (
        <View className="rounded-3xl border border-border bg-surface p-4">
            <View className="flex-row items-center gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/10">
                    <Stethoscope color={brand[600]} size={24} strokeWidth={2} />
                </View>
                <View className="flex-1">
                    <Text className="text-base font-semibold text-foreground">
                        {doctor.name}
                    </Text>
                    <Text className="mt-0.5 text-xs font-sans text-muted">
                        {doctor.department} · {doctor.hospital}
                    </Text>
                </View>
                <View className="flex-row items-center gap-1">
                    <Star color="#f59e0b" size={14} fill="#f59e0b" />
                    <Text className="text-sm font-semibold text-foreground">
                        {doctor.rating}
                    </Text>
                </View>
            </View>

            <View className="mt-3 flex-row items-center justify-between">
                <Text
                    className={
                        doctor.available
                            ? "text-xs font-semibold text-success"
                            : "text-xs font-sans text-muted"
                    }
                >
                    {doctor.available ? "Available today" : "Not available"}
                </Text>
                {doctor.available && doctor.slots.length > 0 && (
                    <View className="flex-row gap-1.5">
                        {doctor.slots.map((slot) => (
                            <View
                                key={slot}
                                className="rounded-lg bg-surface-muted px-2 py-1"
                            >
                                <Text className="text-xs font-sans text-foreground">
                                    {slot}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        </View>
    );
}

export default function FindDoctor() {
    const { colors } = useAppTheme();
    const [query, setQuery] = useState("");
    const [department, setDepartment] = useState("All");

    const departments = [
        "All",
        ...Array.from(new Set(DOCTORS.map((d) => d.department))),
    ];

    const filtered = DOCTORS.filter((d) => {
        const matchesDepartment =
            department === "All" || d.department === department;
        const q = query.toLowerCase();
        const matchesQuery =
            d.name.toLowerCase().includes(q) ||
            d.department.toLowerCase().includes(q) ||
            d.hospital.toLowerCase().includes(q);
        return matchesDepartment && matchesQuery;
    });

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            className="flex-1"
        >
            <View className="px-6 pt-6">
                <Text className="text-2xl font-display-bold text-foreground">
                    Find Doctor
                </Text>
                <Text className="mt-1 text-sm font-sans text-muted">
                    Search by department or category.
                </Text>

                <View className="relative mt-5">
                    <View className="absolute bottom-0 left-4 top-0 justify-center">
                        <Search color={colors.muted} size={18} strokeWidth={2} />
                    </View>
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search by name or department"
                        placeholderTextColor={colors.muted}
                        className="rounded-2xl border border-border bg-surface py-3 pl-11 pr-4 text-base text-foreground"
                    />
                </View>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                    className="mt-4"
                >
                    {departments.map((dep) => {
                        const isActive = dep === department;
                        return (
                            <Pressable
                                key={dep}
                                onPress={() => setDepartment(dep)}
                                className={[
                                    "rounded-full border px-4 py-2",
                                    isActive
                                        ? "border-brand-600 bg-brand-600"
                                        : "border-border bg-surface",
                                ].join(" ")}
                            >
                                <Text
                                    className={[
                                        "text-sm",
                                        isActive
                                            ? "font-semibold text-white"
                                            : "font-sans text-foreground",
                                    ].join(" ")}
                                >
                                    {dep}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>

                <View className="mt-4 gap-3">
                    {filtered.map((doctor) => (
                        <DoctorCard key={doctor.id} doctor={doctor} />
                    ))}
                    {filtered.length === 0 && (
                        <Text className="py-8 text-center text-sm font-sans text-muted">
                            No doctors found.
                        </Text>
                    )}
                </View>
            </View>
        </ScrollView>
    );
}
