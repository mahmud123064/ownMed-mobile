import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Plus, Users } from "lucide-react-native";
import {
    Alert,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

import { brand, status, useAppTheme } from "@/theme";

import { FAMILY_MEMBERS } from "../mock";
import type { FamilyMember } from "../types";

type MemberForm = {
    name: string;
    relation: string;
    age: string;
};

export default function FamilyMembers() {
    const { colors } = useAppTheme();
    const [members, setMembers] = useState<FamilyMember[]>(FAMILY_MEMBERS);

    const form = useForm<MemberForm>({
        defaultValues: { name: "", relation: "", age: "" },
    });

    const onAdd = (data: MemberForm) => {
        setMembers((prev) => [
            {
                id: String(Date.now()),
                name: data.name,
                relation: data.relation,
                age: Number(data.age) || 0,
                healthStatus: "No data yet",
                status: "stable",
            },
            ...prev,
        ]);
        form.reset();
        Alert.alert("Family member", "Member added (demo).");
    };

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            className="flex-1"
        >
            <View className="px-6 pt-6">
                <Text className="text-2xl font-display-bold text-foreground">
                    Family Member Status
                </Text>
                <Text className="mt-1 text-sm font-sans text-muted">
                    Add family members and view their health status.
                </Text>

                <View className="mt-5 gap-3">
                    {members.map((member) => (
                        <View
                            key={member.id}
                            className="flex-row items-center gap-3 rounded-3xl border border-border bg-surface p-4"
                        >
                            <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10">
                                <Users
                                    color={brand[600]}
                                    size={22}
                                    strokeWidth={2}
                                />
                            </View>
                            <View className="flex-1">
                                <Text className="text-sm font-semibold text-foreground">
                                    {member.name}
                                </Text>
                                <Text className="mt-0.5 text-xs font-sans text-muted">
                                    {member.relation} · {member.age} yrs
                                </Text>
                                <Text className="mt-1 text-xs font-sans text-muted">
                                    {member.healthStatus}
                                </Text>
                            </View>
                            <View
                                className={`h-2.5 w-2.5 rounded-full ${
                                    member.status === "stable"
                                        ? "bg-success"
                                        : "bg-warning"
                                }`}
                            />
                        </View>
                    ))}
                </View>

                <Text className="mt-8 text-lg font-semibold text-foreground">
                    Add family member
                </Text>
                <View className="mt-3 gap-4">
                    <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">
                            Name
                        </Text>
                        <Controller
                            control={form.control}
                            name="name"
                            rules={{ required: "Name is required." }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <TextInput
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    placeholder="Family member name"
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
                            Relation
                        </Text>
                        <Controller
                            control={form.control}
                            name="relation"
                            rules={{ required: "Relation is required." }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <TextInput
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    placeholder="e.g. Mother, Father, Spouse"
                                    placeholderTextColor={colors.muted}
                                    className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                />
                            )}
                        />
                        {form.formState.errors.relation && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {form.formState.errors.relation.message}
                            </Text>
                        )}
                    </View>

                    <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">
                            Age
                        </Text>
                        <Controller
                            control={form.control}
                            name="age"
                            rules={{
                                required: "Age is required.",
                                pattern: {
                                    value: /^[0-9]{1,3}$/,
                                    message: "Enter a valid age.",
                                },
                            }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <TextInput
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    placeholder="e.g. 58"
                                    placeholderTextColor={colors.muted}
                                    keyboardType="number-pad"
                                    className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                />
                            )}
                        />
                        {form.formState.errors.age && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {form.formState.errors.age.message}
                            </Text>
                        )}
                    </View>

                    <Pressable
                        onPress={form.handleSubmit(onAdd)}
                        className="flex-row items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4"
                    >
                        <Plus color="#ffffff" size={18} strokeWidth={2.5} />
                        <Text className="text-base font-semibold text-white">
                            Add member
                        </Text>
                    </Pressable>
                </View>
            </View>
        </ScrollView>
    );
}
