import { useState } from "react";
import { Building2, MapPin, Search, Star } from "lucide-react-native";
import { ScrollView, Text, TextInput, View } from "react-native";

import { brand, useAppTheme } from "@/theme";

import { HOSPITALS } from "../mock";

export default function FindHospital() {
    const { colors } = useAppTheme();
    const [query, setQuery] = useState("");

    const filtered = HOSPITALS.filter((h) => {
        const q = query.toLowerCase();
        return (
            h.name.toLowerCase().includes(q) ||
            h.departments.some((d) => d.toLowerCase().includes(q))
        );
    });

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            className="flex-1"
        >
            <View className="px-6 pt-6">
                <Text className="text-2xl font-display-bold text-foreground">
                    Find Hospital
                </Text>
                <Text className="mt-1 text-sm font-sans text-muted">
                    Search by name or nearby location.
                </Text>

                <View className="relative mt-5">
                    <View className="absolute bottom-0 left-4 top-0 justify-center">
                        <Search color={colors.muted} size={18} strokeWidth={2} />
                    </View>
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search hospitals by name"
                        placeholderTextColor={colors.muted}
                        className="rounded-2xl border border-border bg-surface py-3 pl-11 pr-4 text-base text-foreground"
                    />
                </View>

                <View className="mt-5 gap-3">
                    {filtered.map((hospital) => (
                        <View
                            key={hospital.id}
                            className="rounded-3xl border border-border bg-surface p-4"
                        >
                            <View className="flex-row items-center gap-3">
                                <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10">
                                    <Building2
                                        color={brand[600]}
                                        size={22}
                                        strokeWidth={2}
                                    />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-sm font-semibold text-foreground">
                                        {hospital.name}
                                    </Text>
                                    <View className="mt-1 flex-row items-center gap-1">
                                        <MapPin
                                            color={colors.muted}
                                            size={12}
                                            strokeWidth={2}
                                        />
                                        <Text className="text-xs font-sans text-muted">
                                            {hospital.distance}
                                        </Text>
                                    </View>
                                </View>
                                <View className="flex-row items-center gap-1">
                                    <Star
                                        color="#f59e0b"
                                        size={12}
                                        fill="#f59e0b"
                                    />
                                    <Text className="text-xs font-semibold text-foreground">
                                        {hospital.rating}
                                    </Text>
                                </View>
                            </View>
                            <View className="mt-3 flex-row flex-wrap gap-1.5">
                                {hospital.departments.map((dep) => (
                                    <View
                                        key={dep}
                                        className="rounded-lg bg-surface-muted px-2 py-1"
                                    >
                                        <Text className="text-xs font-sans text-muted">
                                            {dep}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    ))}
                    {filtered.length === 0 && (
                        <Text className="py-8 text-center text-sm font-sans text-muted">
                            No hospitals found.
                        </Text>
                    )}
                </View>
            </View>
        </ScrollView>
    );
}
