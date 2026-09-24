import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Bell, Pill, Plus } from "lucide-react-native";
import {
    Alert,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

import { brand, status, useAppTheme } from "@/theme";

import { MEDICINES } from "../mock";
import type { Medicine } from "../types";

type MedicineForm = {
    name: string;
    dosage: string;
    frequency: string;
    time: string;
};

export default function AddMedicine() {
    const { colors } = useAppTheme();
    const [medicines, setMedicines] = useState<Medicine[]>(MEDICINES);

    const form = useForm<MedicineForm>({
        defaultValues: { name: "", dosage: "", frequency: "", time: "" },
    });

    const onAdd = (data: MedicineForm) => {
        setMedicines((prev) => [
            {
                id: String(Date.now()),
                name: data.name,
                dosage: data.dosage,
                frequency: data.frequency,
                time: data.time,
            },
            ...prev,
        ]);
        form.reset();
        Alert.alert("Medicine", "Medicine added (demo).");
    };

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            className="flex-1"
        >
            <View className="px-6 pt-6">
                <Text className="text-2xl font-display-bold text-foreground">
                    Add Medicine
                </Text>
                <Text className="mt-1 text-sm font-sans text-muted">
                    Add medicine details and schedule reminders.
                </Text>

                <View className="mt-5 gap-4">
                    <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">
                            Medicine name
                        </Text>
                        <Controller
                            control={form.control}
                            name="name"
                            rules={{ required: "Medicine name is required." }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <TextInput
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    placeholder="e.g. Paracetamol 500mg"
                                    placeholderTextColor={colors.muted}
                                    className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                />
                            )}
                        />
                        {form.formState.errors.name && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {form.formState.errors.name.message}
                            </Text>
                        )}
                    </View>

                    <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">
                            Dosage
                        </Text>
                        <Controller
                            control={form.control}
                            name="dosage"
                            rules={{ required: "Dosage is required." }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <TextInput
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    placeholder="e.g. 1 tablet"
                                    placeholderTextColor={colors.muted}
                                    className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                />
                            )}
                        />
                        {form.formState.errors.dosage && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {form.formState.errors.dosage.message}
                            </Text>
                        )}
                    </View>

                    <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">
                            Frequency
                        </Text>
                        <Controller
                            control={form.control}
                            name="frequency"
                            rules={{ required: "Frequency is required." }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <TextInput
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    placeholder="e.g. Twice daily"
                                    placeholderTextColor={colors.muted}
                                    className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                />
                            )}
                        />
                        {form.formState.errors.frequency && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {form.formState.errors.frequency.message}
                            </Text>
                        )}
                    </View>

                    <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">
                            Reminder time
                        </Text>
                        <Controller
                            control={form.control}
                            name="time"
                            rules={{ required: "Reminder time is required." }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <TextInput
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    placeholder="e.g. 08:00, 20:00"
                                    placeholderTextColor={colors.muted}
                                    className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                />
                            )}
                        />
                        {form.formState.errors.time && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {form.formState.errors.time.message}
                            </Text>
                        )}
                    </View>

                    <Pressable
                        onPress={form.handleSubmit(onAdd)}
                        className="flex-row items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4"
                    >
                        <Plus color="#ffffff" size={18} strokeWidth={2.5} />
                        <Text className="text-base font-semibold text-white">
                            Add medicine
                        </Text>
                    </Pressable>
                </View>

                <Text className="mt-8 text-lg font-semibold text-foreground">
                    Reminders
                </Text>
                <View className="mt-3 gap-3">
                    {medicines.map((medicine) => (
                        <View
                            key={medicine.id}
                            className="flex-row items-center gap-3 rounded-3xl border border-border bg-surface p-4"
                        >
                            <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10">
                                <Pill
                                    color={brand[600]}
                                    size={22}
                                    strokeWidth={2}
                                />
                            </View>
                            <View className="flex-1">
                                <Text className="text-sm font-semibold text-foreground">
                                    {medicine.name}
                                </Text>
                                <Text className="mt-0.5 text-xs font-sans text-muted">
                                    {medicine.dosage} · {medicine.frequency}
                                </Text>
                            </View>
                            <View className="items-end gap-1">
                                <View className="flex-row items-center gap-1">
                                    <Bell
                                        color={colors.muted}
                                        size={12}
                                        strokeWidth={2}
                                    />
                                    <Text className="text-xs font-sans text-muted">
                                        {medicine.time}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
