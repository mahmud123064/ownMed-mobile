import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import * as ImagePicker from "expo-image-picker";
import {
    Camera,
    Check,
    ChevronDown,
    Eye,
    EyeOff,
    User,
} from "lucide-react-native";
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { brand, status, useAppTheme } from "@/theme";

type FormValues = {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    phone: string;
    role: string;
};

const ROLES = ["Patient", "Doctor"] as const;

type RoleSelectProps = {
    value: string;
    onChange: (value: string) => void;
};

/** Custom select — a pressable field that opens a centered role picker modal. */
function RoleSelect({ value, onChange }: RoleSelectProps) {
    const { colors } = useAppTheme();
    const [open, setOpen] = useState(false);

    return (
        <>
            <Pressable
                onPress={() => setOpen(true)}
                className="flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3"
            >
                <Text
                    className={
                        value ? "text-base text-foreground" : "text-base text-muted"
                    }
                >
                    {value || "Select your role"}
                </Text>
                <ChevronDown color={colors.muted} size={20} strokeWidth={2} />
            </Pressable>

            <Modal
                transparent
                visible={open}
                animationType="fade"
                onRequestClose={() => setOpen(false)}
            >
                <View className="flex-1 justify-center px-6">
                    <Pressable
                        className="absolute inset-0 bg-black/50"
                        onPress={() => setOpen(false)}
                    />
                    <View className="rounded-3xl border border-border bg-surface p-2">
                        {ROLES.map((role) => {
                            const selected = role === value;
                            return (
                                <Pressable
                                    key={role}
                                    onPress={() => {
                                        onChange(role);
                                        setOpen(false);
                                    }}
                                    android_ripple={{
                                        color: "rgba(0,0,0,0.06)",
                                    }}
                                    className="flex-row items-center justify-between rounded-2xl px-4 py-4"
                                >
                                    <Text
                                        className={
                                            selected
                                                ? "text-base font-semibold text-brand-600"
                                                : "text-base font-sans text-foreground"
                                        }
                                    >
                                        {role}
                                    </Text>
                                    {selected ? (
                                        <Check
                                            color={brand[600]}
                                            size={20}
                                            strokeWidth={2.5}
                                        />
                                    ) : null}
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            </Modal>
        </>
    );
}

export default function SignUpScreen() {
    const { colors } = useAppTheme();
    const [image, setImage] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const {
        control,
        handleSubmit,
        getValues,
        formState: { errors },
    } = useForm<FormValues>({
        defaultValues: {
            name: "",
            email: "",
            password: "",
            confirmPassword: "",
            phone: "",
            role: "",
        },
    });

    const onSubmit = () => {
        Alert.alert("Sign Up", "Account creation is not wired up yet.");
    };

    const pickImage = async (source: "camera" | "library") => {
        try {
            if (source === "camera") {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) {
                    Alert.alert(
                        "Permission needed",
                        "Enable camera access to take a profile photo.",
                    );
                    return;
                }
                const result = await ImagePicker.launchCameraAsync({
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.7,
                });
                if (!result.canceled) setImage(result.assets[0].uri);
            } else {
                const perm =
                    await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!perm.granted) {
                    Alert.alert(
                        "Permission needed",
                        "Enable photo library access to choose a profile photo.",
                    );
                    return;
                }
                const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ["images"],
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.7,
                });
                if (!result.canceled) setImage(result.assets[0].uri);
            }
        } catch {
            Alert.alert(
                "Something went wrong",
                "Could not open the image picker.",
            );
        }
    };

    const showImageOptions = () => {
        const buttons: {
            text: string;
            onPress?: () => void;
            style?: "default" | "cancel" | "destructive";
        }[] = [
            { text: "Take Photo", onPress: () => pickImage("camera") },
            {
                text: "Choose from Library",
                onPress: () => pickImage("library"),
            },
        ];

        if (image) {
            buttons.push({
                text: "Remove Photo",
                style: "destructive",
                onPress: () => setImage(null),
            });
        }

        buttons.push({ text: "Cancel", style: "cancel" });

        Alert.alert("Profile photo", "Choose a photo for your profile.", buttons);
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: 32 }}
                >
                    {/* Header */}
                    <View className="px-6 pt-6">
                        <Text className="text-center text-3xl font-display-bold text-foreground">
                            Create account
                        </Text>
                        <Text className="mt-1 text-center text-base font-sans text-muted">
                            Fill in your details to get started.
                        </Text>
                    </View>

                    {/* Profile image */}
                    <Pressable
                        onPress={showImageOptions}
                        className="mt-6 items-center gap-3"
                    >
                        <View className="relative h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-muted">
                            {image ? (
                                <Image
                                    source={{ uri: image }}
                                    className="h-full w-full"
                                />
                            ) : (
                                <User
                                    color={colors.muted}
                                    size={40}
                                    strokeWidth={1.5}
                                />
                            )}
                            <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-brand-600">
                                <Camera
                                    color="#ffffff"
                                    size={14}
                                    strokeWidth={2}
                                />
                            </View>
                        </View>
                        <Text className="text-sm font-semibold text-brand-600">
                            {image ? "Change photo" : "Add profile photo"}
                        </Text>
                    </Pressable>

                    {/* Form */}
                    <View className="mt-8 gap-4 px-6">
                        {/* Name */}
                        <View className="gap-2">
                            <Text className="text-sm font-medium text-foreground">
                                Name
                            </Text>
                            <Controller
                                control={control}
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
                                        autoComplete="name"
                                        className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                    />
                                )}
                            />
                            {errors.name && (
                                <Text
                                    style={{ color: status.danger }}
                                    className="font-sans text-xs"
                                >
                                    {errors.name.message}
                                </Text>
                            )}
                        </View>

                        {/* Email */}
                        <View className="gap-2">
                            <Text className="text-sm font-medium text-foreground">
                                Email
                            </Text>
                            <Controller
                                control={control}
                                name="email"
                                rules={{
                                    required: "Email is required.",
                                    pattern: {
                                        value: /\S+@\S+\.\S+/,
                                        message:
                                            "Enter a valid email address.",
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
                                        autoComplete="email"
                                        className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                    />
                                )}
                            />
                            {errors.email && (
                                <Text
                                    style={{ color: status.danger }}
                                    className="font-sans text-xs"
                                >
                                    {errors.email.message}
                                </Text>
                            )}
                        </View>

                        {/* Password */}
                        <View className="gap-2">
                            <Text className="text-sm font-medium text-foreground">
                                Password
                            </Text>
                            <Controller
                                control={control}
                                name="password"
                                rules={{
                                    required: "Password is required.",
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
                                            placeholder="Create a password"
                                            placeholderTextColor={colors.muted}
                                            secureTextEntry={!showPassword}
                                            autoCapitalize="none"
                                            className="rounded-2xl border border-border bg-surface px-4 py-3 pr-12 text-base text-foreground"
                                        />
                                        <Pressable
                                            onPress={() =>
                                                setShowPassword((v) => !v)
                                            }
                                            hitSlop={8}
                                            className="absolute right-0 top-0 bottom-0 justify-center px-4"
                                        >
                                            {showPassword ? (
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
                            {errors.password && (
                                <Text
                                    style={{ color: status.danger }}
                                    className="font-sans text-xs"
                                >
                                    {errors.password.message}
                                </Text>
                            )}
                        </View>

                        {/* Confirm password */}
                        <View className="gap-2">
                            <Text className="text-sm font-medium text-foreground">
                                Confirm Password
                            </Text>
                            <Controller
                                control={control}
                                name="confirmPassword"
                                rules={{
                                    required: "Confirm your password.",
                                    validate: (value) =>
                                        value === getValues("password") ||
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
                                            placeholder="Re-enter your password"
                                            placeholderTextColor={colors.muted}
                                            secureTextEntry={!showConfirmPassword}
                                            autoCapitalize="none"
                                            className="rounded-2xl border border-border bg-surface px-4 py-3 pr-12 text-base text-foreground"
                                        />
                                        <Pressable
                                            onPress={() =>
                                                setShowConfirmPassword((v) => !v)
                                            }
                                            hitSlop={8}
                                            className="absolute right-0 top-0 bottom-0 justify-center px-4"
                                        >
                                            {showConfirmPassword ? (
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
                            {errors.confirmPassword && (
                                <Text
                                    style={{ color: status.danger }}
                                    className="font-sans text-xs"
                                >
                                    {errors.confirmPassword.message}
                                </Text>
                            )}
                        </View>

                        {/* Phone number */}
                        <View className="gap-2">
                            <Text className="text-sm font-medium text-foreground">
                                Phone Number
                            </Text>
                            <Controller
                                control={control}
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
                                        autoComplete="tel"
                                        className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                    />
                                )}
                            />
                            {errors.phone && (
                                <Text
                                    style={{ color: status.danger }}
                                    className="font-sans text-xs"
                                >
                                    {errors.phone.message}
                                </Text>
                            )}
                        </View>

                        {/* Role */}
                        <View className="gap-2">
                            <Text className="text-sm font-medium text-foreground">
                                Select your role
                            </Text>
                            <Controller
                                control={control}
                                name="role"
                                rules={{
                                    required: "Please select your role.",
                                }}
                                render={({ field: { value, onChange } }) => (
                                    <RoleSelect
                                        value={value}
                                        onChange={onChange}
                                    />
                                )}
                            />
                            {errors.role && (
                                <Text
                                    style={{ color: status.danger }}
                                    className="font-sans text-xs"
                                >
                                    {errors.role.message}
                                </Text>
                            )}
                        </View>

                        {/* Submit */}
                        <Pressable
                            onPress={handleSubmit(onSubmit)}
                            android_ripple={{
                                color: "rgba(255,255,255,0.15)",
                            }}
                            className="mt-2 items-center justify-center rounded-2xl bg-brand-600 py-4"
                        >
                            <Text className="text-base font-semibold text-white">
                                Create Account
                            </Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
