import { useState } from "react";
import { Link, router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import {
    Check,
    Eye,
    EyeOff,
    HeartPulse,
    Lock,
    Mail,
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
    email: string;
    password: string;
    rememberMe: boolean;
};

export default function SignInScreen() {
    const { colors } = useAppTheme();
    const { signIn } = useAppData();
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const {
        control,
        handleSubmit,
        formState: { errors },
    } = useForm<FormValues>({
        defaultValues: { email: "", password: "", rememberMe: false },
    });

    const onSubmit = async (data: FormValues) => {
        setServerError(null);
        setSubmitting(true);
        try {
            await signIn(
                {
                    email: data.email,
                    password: data.password,
                },
                data.rememberMe,
            );
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

    const handleForgotPassword = () => {
        router.push("/forgot-password");
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
                    contentContainerStyle={{ flexGrow: 1 }}
                >
                    {/* Centered content */}
                    <View className="flex-1 justify-center px-6 py-10">
                        {/* Bordered login card */}
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
                                    Welcome back
                                </Text>
                                <Text className="mt-2 max-w-xs text-center text-base font-sans text-muted">
                                    Sign in to your account to continue.
                                </Text>
                            </View>

                            {/* Form */}
                            <View className="mt-8 gap-5">
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
                                            placeholder="Enter your password"
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

                                {/* Remember me + Forgot password */}
                                <View className="flex-row items-center justify-between">
                                    <Controller
                                        control={control}
                                        name="rememberMe"
                                        render={({
                                            field: { value, onChange },
                                        }) => (
                                            <Pressable
                                                onPress={() => onChange(!value)}
                                                hitSlop={8}
                                                className="flex-row items-center gap-2"
                                            >
                                                <View
                                                    className={[
                                                        "h-5 w-5 items-center justify-center rounded-md border",
                                                        value
                                                            ? "border-brand-600 bg-brand-600"
                                                            : "border-border bg-surface",
                                                    ].join(" ")}
                                                >
                                                    {value ? (
                                                        <Check
                                                            color="#ffffff"
                                                            size={14}
                                                            strokeWidth={3}
                                                        />
                                                    ) : null}
                                                </View>
                                                <Text className="text-sm font-sans text-foreground">
                                                    Remember me
                                                </Text>
                                            </Pressable>
                                        )}
                                    />
                                    <Pressable
                                        onPress={handleForgotPassword}
                                        hitSlop={8}
                                    >
                                        <Text className="text-sm font-semibold text-brand-600">
                                            Forgot password?
                                        </Text>
                                    </Pressable>
                                </View>

                                {/* Server error */}
                                {serverError ? (
                                    <View className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3">
                                        <Text className="text-sm font-sans text-danger">
                                            {serverError}
                                        </Text>
                                    </View>
                                ) : null}

                                {/* Sign In button */}
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
                                        {submitting ? "Signing in..." : "Sign In"}
                                    </Text>
                                </Pressable>

                            </View>

                            {/* Footer */}
                            <View className="mt-8 flex-row items-center justify-center gap-1">
                                <Text className="text-md font-sans text-muted">
                                    Are you new?
                                </Text>
                                <Link
                                    href="/sign-up"
                                    className="text-md font-semibold text-brand-700"
                                >
                                    Sign up
                                </Link>
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
