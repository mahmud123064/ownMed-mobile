import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link2, Plus, Unlink, Users } from "lucide-react-native";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

import FormField from "@/components/ui/FormField";
import { useAppData } from "@/context/AppDataContext";
import { brand, status, useAppTheme } from "@/theme";

type MemberForm = {
    name: string;
    relation: string;
    age: string;
};

export default function FamilyMembers() {
    const { colors } = useAppTheme();
    const {
        familyMembers,
        addFamilyMember,
        familyLink,
        lookupFamily,
        connectFamily,
        disconnectFamily,
    } = useAppData();

    const [shareId, setShareId] = useState("");
    const [linking, setLinking] = useState(false);

    const form = useForm<MemberForm>({
        defaultValues: { name: "", relation: "", age: "" },
    });

    const onAdd = (data: MemberForm) => {
        addFamilyMember({
            name: data.name,
            relation: data.relation,
            age: Number(data.age) || 0,
        });
        form.reset();
    };

    /**
     * Two steps on purpose: resolve the code first, then ask. Switching scope
     * swaps everything the other sections show, so it should not happen on a
     * mistyped digit — and naming the person is how the user confirms they
     * typed the right code.
     */
    const onConnect = async () => {
        const id = shareId.trim();
        if (id === "") return;

        setLinking(true);
        try {
            const contact = await lookupFamily(id);
            Alert.alert(
                `Connect to ${contact.name}?`,
                "You'll be able to add and update their medicines, prescriptions and family members. Your own data stays on your account.",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Connect",
                        onPress: () => {
                            setShareId("");
                            void connectFamily(contact);
                        },
                    },
                ],
            );
        } catch (error) {
            Alert.alert(
                "Family ID not found",
                error instanceof Error
                    ? error.message
                    : "Check the ID and try again.",
            );
        } finally {
            setLinking(false);
        }
    };

    const onDisconnect = () => {
        Alert.alert(
            "Disconnect?",
            `You'll go back to your own medicines and family members. ${familyLink?.name ?? "Their"} data stays on their account.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Disconnect",
                    style: "destructive",
                    onPress: () => void disconnectFamily(),
                },
            ],
        );
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
                    {familyLink
                        ? `Managing ${familyLink.name}'s family members.`
                        : "Add family members and view their health status."}
                </Text>

                {/* Linking by Family ID. While linked, this whole section —
                    and Add Medicine — reads and writes the other account. */}
                {familyLink ? (
                    <View className="mt-5 flex-row items-center gap-3 rounded-3xl border border-brand-600/30 bg-brand-600/10 p-4">
                        <View className="h-10 w-10 items-center justify-center rounded-2xl bg-brand-600/15">
                            <Link2 color={brand[600]} size={18} strokeWidth={2} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-sm font-semibold text-foreground">
                                {familyLink.name}
                            </Text>
                            <Text className="mt-0.5 text-xs font-sans text-muted">
                                Family ID {familyLink.shareId}
                            </Text>
                        </View>
                        <Pressable
                            onPress={onDisconnect}
                            hitSlop={8}
                            className="flex-row items-center gap-1.5 rounded-2xl border border-border bg-surface px-3 py-2"
                        >
                            <Unlink color={colors.muted} size={14} strokeWidth={2} />
                            <Text className="text-xs font-semibold text-muted">
                                Disconnect
                            </Text>
                        </Pressable>
                    </View>
                ) : (
                    <View className="mt-5 gap-3 rounded-3xl border border-border bg-surface p-4">
                        <Text className="text-sm font-semibold text-foreground">
                            Connect to a family member
                        </Text>
                        <Text className="text-xs font-sans text-muted">
                            Enter the Family ID they shared with you to add and
                            update their medicines and reports.
                        </Text>
                        <View className="flex-row items-end gap-2">
                            <View className="flex-1">
                                <FormField
                                    label="Family ID"
                                    icon={Link2}
                                    value={shareId}
                                    onChangeText={setShareId}
                                    onSubmitEditing={() => void onConnect()}
                                    placeholder="e.g. RHIM4K7P"
                                    // Codes are uppercase; a phone keyboard
                                    // would otherwise fight the user.
                                    autoCapitalize="characters"
                                    autoCorrect={false}
                                    returnKeyType="done"
                                />
                            </View>
                            <Pressable
                                onPress={() => void onConnect()}
                                disabled={linking || shareId.trim() === ""}
                                className={`flex-row items-center gap-2 rounded-2xl bg-brand-600 px-5 py-3 ${
                                    linking || shareId.trim() === ""
                                        ? "opacity-50"
                                        : ""
                                }`}
                            >
                                {linking ? (
                                    <ActivityIndicator
                                        color="#ffffff"
                                        size="small"
                                    />
                                ) : (
                                    <Link2
                                        color="#ffffff"
                                        size={16}
                                        strokeWidth={2}
                                    />
                                )}
                                <Text className="text-sm font-semibold text-white">
                                    Connect
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                )}

                <View className="mt-5 gap-3">
                    {familyMembers.length === 0 && (
                        <Text className="py-6 text-center text-sm font-sans text-muted">
                            No family members yet. Add one below to track their
                            health.
                        </Text>
                    )}
                    {familyMembers.map((member) => (
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
                    {familyLink
                        ? `Add ${familyLink.name}'s family member`
                        : "Add family member"}
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
                                // The pattern alone accepts 999. The server caps
                                // the column at 150, so anything above it would
                                // be rejected there instead — with a confusing
                                // error, and only once the whole sync payload
                                // fails. Match the bound locally.
                                validate: (value) =>
                                    Number(value) <= 150 ||
                                    "Enter an age up to 150.",
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
