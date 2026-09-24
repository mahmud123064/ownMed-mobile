import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import * as ImagePicker from "expo-image-picker";
import { Camera, Eye, EyeOff, User } from "lucide-react-native";
import {
    Alert,
    Image,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

import { status, useAppTheme } from "@/theme";

import { MOCK_USER } from "../mock";

type PersonalInfo = {
    name: string;
    email: string;
    phone: string;
};

type PasswordForm = {
    current: string;
    next: string;
    confirm: string;
};

export default function Profile() {
    const { colors } = useAppTheme();
    const [avatar, setAvatar] = useState<string | null>(MOCK_USER.avatar);
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const personal = useForm<PersonalInfo>({
        defaultValues: {
            name: MOCK_USER.name,
            email: MOCK_USER.email,
            phone: MOCK_USER.phone,
        },
    });

    const password = useForm<PasswordForm>({
        defaultValues: { current: "", next: "", confirm: "" },
    });

    const pickAvatar = async () => {
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                Alert.alert(
                    "Permission needed",
                    "Enable photo library access to change your profile image.",
                );
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.7,
            });
            if (!result.canceled) setAvatar(result.assets[0].uri);
        } catch {
            Alert.alert("Something went wrong", "Could not open the image picker.");
        }
    };

    const onSavePersonal = () => {
        Alert.alert("Profile", "Personal information updated (demo).");
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

                {/* Profile image */}
                <View className="mt-6 items-center gap-3">
                    <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-muted">
                        {avatar ? (
                            <Image
                                source={{ uri: avatar }}
                                className="h-full w-full"
                            />
                        ) : (
                            <User color={colors.muted} size={40} strokeWidth={1.5} />
                        )}
                    </View>
                    <Pressable
                        onPress={pickAvatar}
                        className="flex-row items-center gap-2 rounded-full border border-border bg-surface px-4 py-2"
                    >
                        <Camera color={colors.muted} size={16} strokeWidth={2} />
                        <Text className="text-sm font-semibold text-foreground">
                            Change profile image
                        </Text>
                    </Pressable>
                </View>

                {/* Personal information */}
                <Text className="mt-8 text-lg font-semibold text-foreground">
                    Personal information
                </Text>
                <View className="mt-3 gap-4">
                    <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">
                            Name
                        </Text>
                        <Controller
                            control={personal.control}
                            name="name"
                            rules={{ required: "Name is required." }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <TextInput
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    placeholder="Your full name"
                                    placeholderTextColor={colors.muted}
                                    autoCapitalize="words"
                                    className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                />
                            )}
                        />
                        {personal.formState.errors.name && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {personal.formState.errors.name.message}
                            </Text>
                        )}
                    </View>

                    <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">
                            Email
                        </Text>
                        <Controller
                            control={personal.control}
                            name="email"
                            rules={{
                                required: "Email is required.",
                                pattern: {
                                    value: /\S+@\S+\.\S+/,
                                    message: "Enter a valid email address.",
                                },
                            }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <TextInput
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    placeholder="you@example.com"
                                    placeholderTextColor={colors.muted}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                />
                            )}
                        />
                        {personal.formState.errors.email && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {personal.formState.errors.email.message}
                            </Text>
                        )}
                    </View>

                    <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">
                            Phone
                        </Text>
                        <Controller
                            control={personal.control}
                            name="phone"
                            rules={{
                                required: "Phone number is required.",
                                pattern: {
                                    value: /^[0-9+\-\s]{7,15}$/,
                                    message: "Enter a valid phone number.",
                                },
                            }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <TextInput
                                    value={value}
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    placeholder="Enter your phone number"
                                    placeholderTextColor={colors.muted}
                                    keyboardType="phone-pad"
                                    className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                />
                            )}
                        />
                        {personal.formState.errors.phone && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {personal.formState.errors.phone.message}
                            </Text>
                        )}
                    </View>

                    <Pressable
                        onPress={personal.handleSubmit(onSavePersonal)}
                        className="items-center justify-center rounded-2xl bg-brand-600 py-3.5"
                    >
                        <Text className="text-base font-semibold text-white">
                            Save changes
                        </Text>
                    </Pressable>
                </View>

                {/* Change password */}
                <Text className="mt-8 text-lg font-semibold text-foreground">
                    Change password
                </Text>
                <View className="mt-3 gap-4">
                    <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">
                            Current password
                        </Text>
                        <Controller
                            control={password.control}
                            name="current"
                            rules={{ required: "Current password is required." }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <View className="relative">
                                    <TextInput
                                        value={value}
                                        onChangeText={onChange}
                                        onBlur={onBlur}
                                        placeholder="Enter current password"
                                        placeholderTextColor={colors.muted}
                                        secureTextEntry={!showCurrent}
                                        className="rounded-2xl border border-border bg-surface px-4 py-3 pr-12 text-base text-foreground"
                                    />
                                    <Pressable
                                        onPress={() =>
                                            setShowCurrent((v) => !v)
                                        }
                                        hitSlop={8}
                                        className="absolute right-0 top-0 bottom-0 justify-center px-4"
                                    >
                                        {showCurrent ? (
                                            <EyeOff
                                                color={colors.muted}
                                                size={20}
                                                strokeWidth={2}
                                            />
                                        ) : (
                                            <Eye
                                                color={colors.muted}
                                                size={20}
                                                strokeWidth={2}
                                            />
                                        )}
                                    </Pressable>
                                </View>
                            )}
                        />
                        {password.formState.errors.current && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {password.formState.errors.current.message}
                            </Text>
                        )}
                    </View>

                    <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">
                            New password
                        </Text>
                        <Controller
                            control={password.control}
                            name="next"
                            rules={{
                                required: "New password is required.",
                                minLength: {
                                    value: 6,
                                    message:
                                        "Password must be at least 6 characters.",
                                },
                            }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <View className="relative">
                                    <TextInput
                                        value={value}
                                        onChangeText={onChange}
                                        onBlur={onBlur}
                                        placeholder="Enter new password"
                                        placeholderTextColor={colors.muted}
                                        secureTextEntry={!showNext}
                                        className="rounded-2xl border border-border bg-surface px-4 py-3 pr-12 text-base text-foreground"
                                    />
                                    <Pressable
                                        onPress={() => setShowNext((v) => !v)}
                                        hitSlop={8}
                                        className="absolute right-0 top-0 bottom-0 justify-center px-4"
                                    >
                                        {showNext ? (
                                            <EyeOff
                                                color={colors.muted}
                                                size={20}
                                                strokeWidth={2}
                                            />
                                        ) : (
                                            <Eye
                                                color={colors.muted}
                                                size={20}
                                                strokeWidth={2}
                                            />
                                        )}
                                    </Pressable>
                                </View>
                            )}
                        />
                        {password.formState.errors.next && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {password.formState.errors.next.message}
                            </Text>
                        )}
                    </View>

                    <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">
                            Confirm new password
                        </Text>
                        <Controller
                            control={password.control}
                            name="confirm"
                            rules={{
                                required: "Confirm your new password.",
                                validate: (value) =>
                                    value === password.getValues("next") ||
                                    "Passwords do not match.",
                            }}
                            render={({
                                field: { onChange, onBlur, value },
                            }) => (
                                <View className="relative">
                                    <TextInput
                                        value={value}
                                        onChangeText={onChange}
                                        onBlur={onBlur}
                                        placeholder="Re-enter new password"
                                        placeholderTextColor={colors.muted}
                                        secureTextEntry={!showConfirm}
                                        className="rounded-2xl border border-border bg-surface px-4 py-3 pr-12 text-base text-foreground"
                                    />
                                    <Pressable
                                        onPress={() =>
                                            setShowConfirm((v) => !v)
                                        }
                                        hitSlop={8}
                                        className="absolute right-0 top-0 bottom-0 justify-center px-4"
                                    >
                                        {showConfirm ? (
                                            <EyeOff
                                                color={colors.muted}
                                                size={20}
                                                strokeWidth={2}
                                            />
                                        ) : (
                                            <Eye
                                                color={colors.muted}
                                                size={20}
                                                strokeWidth={2}
                                            />
                                        )}
                                    </Pressable>
                                </View>
                            )}
                        />
                        {password.formState.errors.confirm && (
                            <Text
                                style={{ color: status.danger }}
                                className="font-sans text-xs"
                            >
                                {password.formState.errors.confirm.message}
                            </Text>
                        )}
                    </View>

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
