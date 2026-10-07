import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Droplet, Eye, EyeOff, Lock, Mail, Phone, UserRound } from "lucide-react-native";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

import DateField from "@/components/ui/DateField";
import FormField from "@/components/ui/FormField";
import { useAppData } from "@/context/AppDataContext";
import { useAppTheme } from "@/theme";

import { GUEST_USER } from "../mock";

import type { UserProfile } from "../types";

type PersonalInfo = {
    name: string;
    email: string;
    phone: string;
    gender: string;
    bloodGroup: string;
    dateOfBirth: string;
};

type PasswordForm = {
    current: string;
    next: string;
    confirm: string;
};

/**
 * The options the two chip rows offer. Deliberately short lists — these are
 * facts about the person, not free text, and picking is faster and less
 * error-prone than typing on a phone keyboard.
 */
const GENDERS = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
] as const;

const BLOOD_GROUPS = [
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-",
] as const;

/** A selectable pill, shared by the gender and blood-group rows. */
function Chip({
    label,
    active,
    onPress,
}: {
    label: string;
    active: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            className={`rounded-2xl border px-4 py-2 ${
                active ? "border-brand-600 bg-brand-600/10" : "border-border bg-surface"
            }`}
        >
            <Text
                className={`text-sm ${
                    active
                        ? "font-semibold text-brand-700"
                        : "font-sans text-muted"
                }`}
            >
                {label}
            </Text>
        </Pressable>
    );
}

/**
 * Keyed on the signed-in identity so it remounts when the account changes.
 *
 * The form is seeded from `inputDefaultValues`, which only run at mount — and
 * the dashboard can render before the session has finished loading from disk,
 * so without the remount the fields would show the guest placeholders and never
 * correct themselves.
 */
export default function Profile() {
    const { authUser } = useAppData();
    const user = authUser ?? GUEST_USER;

    return <ProfileForm key={authUser?.id ?? "guest"} user={user} />;
}

function ProfileForm({ user }: { user: UserProfile }) {
    const { colors } = useAppTheme();
    const { authUser, updateProfile } = useAppData();
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [saving, setSaving] = useState(false);

    const personal = useForm<PersonalInfo>({
        defaultValues: {
            name: user.name,
            email: user.email,
            phone: user.phone,
            gender: user.gender ?? "",
            bloodGroup: user.bloodGroup ?? "",
            dateOfBirth: user.dateOfBirth ?? "",
        },
    });

    const password = useForm<PasswordForm>({
        defaultValues: { current: "", next: "", confirm: "" },
    });

    const onSavePersonal = async (data: PersonalInfo) => {
        if (!authUser) {
            Alert.alert(
                "Sign in to save",
                "Your details are kept on your account, so you need to be signed in to save them.",
            );
            return;
        }

        setSaving(true);
        try {
            await updateProfile({
                name: data.name.trim(),
                phone: data.phone.trim(),
                gender: data.gender,
                // A blank is a real answer here (an unset blood group), so it is
                // sent as "" rather than omitted — the server reads an omitted
                // key as "leave this alone".
                bloodGroup: data.bloodGroup,
                dateOfBirth: data.dateOfBirth,
            });
            Alert.alert("Profile", "Personal information updated.");
        } catch (error) {
            Alert.alert(
                "Couldn't save",
                error instanceof Error
                    ? error.message
                    : "Something went wrong. Please try again.",
            );
        } finally {
            setSaving(false);
        }
    };

    const onChangePassword = () => {
        Alert.alert("Password", "Password changed (demo).");
    };

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            className="flex-1"
        >
            <View className="px-6 pt-6">
                <Text className="text-2xl font-display-bold text-foreground">
                    Profile
                </Text>
                <Text className="mt-1 text-sm font-sans text-muted">
                    Manage your account details.
                </Text>

                {/* Personal information */}
                <Text className="mt-8 text-lg font-semibold text-foreground">
                    Personal information
                </Text>
                <View className="mt-3 gap-4">
                    <Controller
                        control={personal.control}
                        name="name"
                        rules={{ required: "Name is required." }}
                        render={({ field: { onChange, onBlur, value } }) => (
                            <FormField
                                label="Name"
                                icon={UserRound}
                                error={personal.formState.errors.name?.message}
                                value={value}
                                onChangeText={onChange}
                                onBlur={onBlur}
                                placeholder="Your full name, e.g. Rahim Uddin"
                                autoCapitalize="words"
                            />
                        )}
                    />

                    {/* Read-only: the email identifies the account, so changing
                        it is a different feature (re-verification), not a
                        profile edit. */}
                    <View className="gap-1">
                        <FormField
                            label="Email"
                            icon={Mail}
                            value={user.email}
                            editable={false}
                            placeholder="you@example.com"
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                        {/* Without this the field just looks broken when a tap
                            produces no keyboard. */}
                        <Text className="text-xs font-sans text-muted">
                            Your email identifies your account and can’t be
                            changed here.
                        </Text>
                    </View>

                    <Controller
                        control={personal.control}
                        name="phone"
                        rules={{
                            pattern: {
                                value: /^[0-9+\-\s]{7,15}$/,
                                message: "Enter a valid phone number.",
                            },
                        }}
                        render={({ field: { onChange, onBlur, value } }) => (
                            <FormField
                                label="Phone"
                                icon={Phone}
                                error={personal.formState.errors.phone?.message}
                                value={value}
                                onChangeText={onChange}
                                onBlur={onBlur}
                                placeholder="e.g. +880 1712-345678"
                                keyboardType="phone-pad"
                            />
                        )}
                    />

                    {/* Gender */}
                    <Controller
                        control={personal.control}
                        name="gender"
                        render={({ field: { onChange, value } }) => (
                            <View className="gap-2">
                                <Text className="text-sm font-medium text-foreground">
                                    Gender
                                </Text>
                                <View className="flex-row flex-wrap gap-2">
                                    {GENDERS.map((option) => (
                                        <Chip
                                            key={option.value}
                                            label={option.label}
                                            active={value === option.value}
                                            // Tapping the selected chip clears
                                            // it, so a mis-tap is undoable.
                                            onPress={() =>
                                                onChange(
                                                    value === option.value
                                                        ? ""
                                                        : option.value,
                                                )
                                            }
                                        />
                                    ))}
                                </View>
                            </View>
                        )}
                    />

                    {/* Blood group */}
                    <Controller
                        control={personal.control}
                        name="bloodGroup"
                        render={({ field: { onChange, value } }) => (
                            <View className="gap-2">
                                <View className="flex-row items-center gap-1.5">
                                    <Droplet
                                        color={colors.muted}
                                        size={14}
                                        strokeWidth={2}
                                    />
                                    <Text className="text-sm font-medium text-foreground">
                                        Blood group
                                    </Text>
                                </View>
                                <View className="flex-row flex-wrap gap-2">
                                    {BLOOD_GROUPS.map((group) => (
                                        <Chip
                                            key={group}
                                            label={group}
                                            active={value === group}
                                            onPress={() =>
                                                onChange(
                                                    value === group ? "" : group,
                                                )
                                            }
                                        />
                                    ))}
                                </View>
                            </View>
                        )}
                    />

                    <Controller
                        control={personal.control}
                        name="dateOfBirth"
                        render={({ field: { onChange, value } }) => (
                            <DateField
                                label="Date of birth"
                                value={value}
                                onChange={onChange}
                                placeholder="Select your date of birth"
                                clearable
                                // Nobody was born tomorrow.
                                maximumDate={new Date()}
                            />
                        )}
                    />

                    <Pressable
                        onPress={personal.handleSubmit(onSavePersonal)}
                        disabled={saving}
                        className={`flex-row items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 ${
                            saving ? "opacity-70" : ""
                        }`}
                    >
                        {saving ? (
                            <ActivityIndicator color="#ffffff" size="small" />
                        ) : null}
                        <Text className="text-base font-semibold text-white">
                            {saving ? "Saving…" : "Save changes"}
                        </Text>
                    </Pressable>
                </View>

                {/* Change password */}
                <Text className="mt-8 text-lg font-semibold text-foreground">
                    Change password
                </Text>
                <View className="mt-3 gap-4">
                    <Controller
                        control={password.control}
                        name="current"
                        rules={{ required: "Current password is required." }}
                        render={({ field: { onChange, onBlur, value } }) => (
                            <FormField
                                label="Current password"
                                icon={Lock}
                                error={password.formState.errors.current?.message}
                                value={value}
                                onChangeText={onChange}
                                onBlur={onBlur}
                                placeholder="Enter your current password"
                                secureTextEntry={!showCurrent}
                                right={
                                    <PasswordToggle
                                        shown={showCurrent}
                                        onPress={() =>
                                            setShowCurrent((v) => !v)
                                        }
                                    />
                                }
                            />
                        )}
                    />

                    <Controller
                        control={password.control}
                        name="next"
                        rules={{
                            required: "New password is required.",
                            minLength: {
                                value: 6,
                                message: "Password must be at least 6 characters.",
                            },
                        }}
                        render={({ field: { onChange, onBlur, value } }) => (
                            <FormField
                                label="New password"
                                icon={Lock}
                                error={password.formState.errors.next?.message}
                                value={value}
                                onChangeText={onChange}
                                onBlur={onBlur}
                                placeholder="At least 6 characters"
                                secureTextEntry={!showNext}
                                right={
                                    <PasswordToggle
                                        shown={showNext}
                                        onPress={() => setShowNext((v) => !v)}
                                    />
                                }
                            />
                        )}
                    />

                    <Controller
                        control={password.control}
                        name="confirm"
                        rules={{
                            required: "Confirm your new password.",
                            validate: (value) =>
                                value === password.getValues("next") ||
                                "Passwords do not match.",
                        }}
                        render={({ field: { onChange, onBlur, value } }) => (
                            <FormField
                                label="Confirm new password"
                                icon={Lock}
                                error={password.formState.errors.confirm?.message}
                                value={value}
                                onChangeText={onChange}
                                onBlur={onBlur}
                                placeholder="Re-enter your new password"
                                secureTextEntry={!showConfirm}
                                right={
                                    <PasswordToggle
                                        shown={showConfirm}
                                        onPress={() =>
                                            setShowConfirm((v) => !v)
                                        }
                                    />
                                }
                            />
                        )}
                    />

                    <Pressable
                        onPress={password.handleSubmit(onChangePassword)}
                        className="items-center justify-center rounded-2xl border border-brand-600 py-3.5"
                    >
                        <Text className="text-base font-semibold text-brand-600">
                            Update password
                        </Text>
                    </Pressable>
                </View>
            </View>
        </ScrollView>
    );
}

/** The show/hide eye beside a password field. */
function PasswordToggle({
    shown,
    onPress,
}: {
    shown: boolean;
    onPress: () => void;
}) {
    const { colors } = useAppTheme();
    return (
        <Pressable onPress={onPress} hitSlop={8}>
            {shown ? (
                <EyeOff color={colors.muted} size={20} strokeWidth={2} />
            ) : (
                <Eye color={colors.muted} size={20} strokeWidth={2} />
            )}
        </Pressable>
    );
}
