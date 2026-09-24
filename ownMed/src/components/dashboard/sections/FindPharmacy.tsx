import { useState } from "react";
import { MapPin, Search, Star, Store } from "lucide-react-native";
import { ScrollView, Text, TextInput, View } from "react-native";

import { brand, useAppTheme } from "@/theme";

import { PHARMACIES } from "../mock";

export default function FindPharmacy() {
    const { colors } = useAppTheme();
    const [query, setQuery] = useState("");

    const filtered = PHARMACIES.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase()),
    );

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            className="flex-1"
        >
            <View className="px-6 pt-6">
                <Text className="text-2xl font-display-bold text-foreground">
                    Find Pharmacy
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
                        placeholder="Search pharmacies by name"
                        placeholderTextColor={colors.muted}
                        className="rounded-2xl border border-border bg-surface py-3 pl-11 pr-4 text-base text-foreground"
                    />
                </View>

                <View className="mt-5 gap-3">
                    {filtered.map((pharmacy) => (
                        <View
                            key={pharmacy.id}
                            className="flex-row items-center gap-3 rounded-3xl border border-border bg-surface p-4"
                        >
                            <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10">
                                <Store
                                    color={brand[600]}
                                    size={22}
                                    strokeWidth={2}
                                />
                            </View>
                            <View className="flex-1">
                                <Text className="text-sm font-semibold text-foreground">
                                    {pharmacy.name}
                                </Text>
                                <View className="mt-1 flex-row items-center gap-1">
                                    <MapPin
                                        color={colors.muted}
                                        size={12}
                                        strokeWidth={2}
                                    />
                                    <Text className="text-xs font-sans text-muted">
                                        {pharmacy.distance}
                                    </Text>
                                </View>
                            </View>
                            <View className="items-end gap-1">
                                <Text
                                    className={
                                        pharmacy.open
                                            ? "text-xs font-semibold text-success"
                                            : "text-xs font-sans text-muted"
                                    }
                                >
                                    {pharmacy.open ? "Open" : "Closed"}
                                </Text>
                                <View className="flex-row items-center gap-1">
                                    <Star
                                        color="#f59e0b"
                                        size={12}
                                        fill="#f59e0b"
                                    />
                                    <Text className="text-xs font-semibold text-foreground">
                                        {pharmacy.rating}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))}
                    {filtered.length === 0 && (
                        <Text className="py-8 text-center text-sm font-sans text-muted">
                            No pharmacies found.
                        </Text>
                    )}
                </View>
            </View>
        </ScrollView>
    );
}
