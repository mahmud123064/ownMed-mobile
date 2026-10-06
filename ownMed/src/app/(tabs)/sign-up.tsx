import { useState } from "react";
import { Link, router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import {
    Eye,
    EyeOff,
    HeartPulse,
    Lock,
    Mail,
    Phone,
    User,
} from "lucide-react-native";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import FormField from "@/components/ui/FormField";
import { useAppData } from "@/context/AppDataContext";
import { brand, useAppTheme } from "@/theme";

type FormValues = {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    phone: string;
};

export default function SignUpScreen() {
    const { colors } = useAppTheme();
    const { register } = useAppData();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

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
        },
    });

    const onSubmit = async (data: FormValues) => {
        setServerError(null);
        setSubmitting(true);
        try {
            await register({
                name: data.name,
                email: data.email,
                password: data.password,
                phone: data.phone,
            });
            router.replace("/dashboard");
        } catch (err) {
            setServerError(
                err instanceof Error
                    ? err.message
                    : "Something went wrong. Please try again.",
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
                >
                    <View className="px-6 py-10">
                        {/* Bordered sign-up card */}
                        <View className="rounded-3xl border border-border bg-surface p-6">
                            {/* Brand */}
                            <View className="items-center">
                                <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-600">
                                    <HeartPulse
                                        color="#ffffff"
                                        size={30}
                                        strokeWidth={2}
                                    />
                                </View>
                                <Text className="mt-6 text-3xl font-display-bold text-foreground">
                                    Create account
                                </Text>
                                <Text className="mt-2 max-w-xs text-center text-base font-sans text-muted">
                                    Fill in your details to get started.
                                </Text>
                            </View>

                            {/* Form */}
                            <View className="mt-8 gap-5">
                                {/* Name */}
                                <Controller
                                    control={control}
                                    name="name"
                                    rules={{ required: "Name is required." }}
                                    render={({
                                        field: { onChange, onBlur, value },
                                    }) => (
                                        <FormField
                                            label="Name"
                                            icon={User}
                                            error={errors.name?.message}
                                            value={value}
                                            onChangeText={onChange}
                                            onBlur={onBlur}
                                            placeholder="Your full name"
                                            autoCapitalize="words"
                                            autoComplete="name"
                                        />
                                    )}
                                />

                                {/* Email */}
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
                                        <FormField
                                            label="Email"
                                            icon={Mail}
                                            error={errors.email?.message}
                                            value={value}
                                            onChangeText={onChange}
                                            onBlur={onBlur}
                                            placeholder="you@example.com"
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            autoComplete="email"
                                        />
                                    )}
                                />

                                {/* Password */}
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
                                        <FormField
                                            label="Password"
                                            icon={Lock}
                                            error={errors.password?.message}
                                            value={value}
                                            onChangeText={onChange}
                                            onBlur={onBlur}
                                            placeholder="Create a password"
                                            autoCapitalize="none"
                                            autoComplete="password"
                                            secureTextEntry={!showPassword}
                                            right={
                                                <Pressable
                                                    onPress={() =>
                                                        setShowPassword(
                                                            (v) => !v,
                                                        )
                                                    }
                                                    hitSlop={8}
                                                    className="p-2"
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
                                            }
                                        />
                                    )}
                                />

                                {/* Confirm password */}
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
                                        <FormField
                                            label="Confirm Password"
                                            icon={Lock}
                                            error={errors.confirmPassword?.message}
                                            value={value}
                                            onChangeText={onChange}
                                            onBlur={onBlur}
                                            placeholder="Re-enter your password"
                                            autoCapitalize="none"
                                            autoComplete="password"
                                            secureTextEntry={!showConfirmPassword}
                                            right={
                                                <Pressable
                                                    onPress={() =>
                                                        setShowConfirmPassword(
                                                            (v) => !v,
                                                        )
                                                    }
                                                    hitSlop={8}
                                                    className="p-2"
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
                                            }
                                        />
                                    )}
                                />

                                {/* Phone */}
                                <Controller
                                    control={control}
                                    name="phone"
                                    rules={{
                                        required: "Phone number is required.",
                                        pattern: {
                                            value: /^[0-9+\-\s]{7,15}$/,
                                            message:
                                                "Enter a valid phone number.",
                                        },
                                    }}
                                    render={({
                                        field: { onChange, onBlur, value },
                                    }) => (
                                        <FormField
                                            label="Phone Number"
                                            icon={Phone}
                                            error={errors.phone?.message}
                                            value={value}
                                            onChangeText={onChange}
                                            onBlur={onBlur}
                                            placeholder="Enter your phone number"
                                            keyboardType="phone-pad"
                                            autoComplete="tel"
                                        />
                                    )}
                                />

                                {/* Server error */}
                                {serverError ? (
                                    <View className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3">
                                        <Text className="text-sm font-sans text-danger">
                                            {serverError}
                                        </Text>
                                    </View>
                                ) : null}

                                {/* Submit */}
                                <Pressable
                                    onPress={handleSubmit(onSubmit)}
                                    disabled={submitting}
                                    android_ripple={{
                                        color: "rgba(255,255,255,0.15)",
                                    }}
                                    style={{
                                        shadowColor: brand[600],
                                        shadowOpacity: 0.35,
                                        shadowRadius: 12,
                                        shadowOffset: { width: 0, height: 6 },
                                        elevation: 4,
                                        opacity: submitting ? 0.7 : 1,
                                    }}
                                    className="mt-1 flex-row items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4"
                                >
                                    {submitting ? (
                                        <ActivityIndicator color="#ffffff" />
                                    ) : null}
                                    <Text className="text-base font-semibold text-white">
                                        {submitting
                                            ? "Creating account..."
                                            : "Create Account"}
                                    </Text>
                                </Pressable>
                            </View>

                            {/* Footer */}
                            <View className="mt-8 flex-row items-center justify-center gap-1">
                                <Text className="text-md font-sans text-muted">
                                    Already have an account?
                                </Text>
                                <Link
                                    href="/sign-in"
                                    className="text-md font-semibold text-brand-700"
                                >
                                    Sign in
                                </Link>
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
