import { useState } from "react";
import { Link, router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import {
    Eye,
    EyeOff,
    HeartPulse,
    KeyRound,
    Lock,
    Mail,
} from "lucide-react-native";
import {
    ActivityIndicator,
    Alert,
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

type EmailForm = {
    email: string;
};

type ResetForm = {
    code: string;
    password: string;
    confirmPassword: string;
};

export default function ForgotPasswordScreen() {
    const { colors } = useAppTheme();
    const { requestPasswordReset, confirmPasswordReset } = useAppData();
    const [step, setStep] = useState<"email" | "reset">("email");
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const emailForm = useForm<EmailForm>({ defaultValues: { email: "" } });
    const resetForm = useForm<ResetForm>({
        defaultValues: { code: "", password: "", confirmPassword: "" },
    });

    const onSendCode = async (data: EmailForm) => {
        setServerError(null);
        setSubmitting(true);
        try {
            await requestPasswordReset({ email: data.email });
            setEmail(data.email);
            setStep("reset");
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

    const onReset = async (data: ResetForm) => {
        setServerError(null);
        setSubmitting(true);
        try {
            await confirmPasswordReset({
                email,
                code: data.code,
                newPassword: data.password,
            });
            Alert.alert(
                "Password updated",
                "Sign in with your new password.",
                [{ text: "OK", onPress: () => router.replace("/sign-in") }],
            );
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
                    contentContainerStyle={{ flexGrow: 1 }}
                >
                    <View className="flex-1 justify-center px-6 py-10">
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
                                    {step === "email"
                                        ? "Forgot password"
                                        : "Reset password"}
                                </Text>
                                <Text className="mt-2 max-w-xs text-center text-base font-sans text-muted">
                                    {step === "email"
                                        ? "Enter your email and we'll send a reset code."
                                        : `Enter the 6-digit code sent to ${email}.`}
                                </Text>
                            </View>

                            <View className="mt-8 gap-5">
                                {step === "email" ? (
                                    <>
                                        <Controller
                                            control={emailForm.control}
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
                                                field: {
                                                    onChange,
                                                    onBlur,
                                                    value,
                                                },
                                            }) => (
                                                <FormField
                                                    label="Email"
                                                    icon={Mail}
                                                    error={
                                                        emailForm.formState
                                                            .errors.email
                                                            ?.message
                                                    }
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
                                    </>
                                ) : (
                                    <>
                                        <Controller
                                            control={resetForm.control}
                                            name="code"
                                            rules={{
                                                required: "Reset code is required.",
                                                pattern: {
                                                    value: /^\d{6}$/,
                                                    message:
                                                        "Enter the 6-digit code.",
                                                },
                                            }}
                                            render={({
                                                field: {
                                                    onChange,
                                                    onBlur,
                                                    value,
                                                },
                                            }) => (
                                                <FormField
                                                    label="Reset code"
                                                    icon={KeyRound}
                                                    error={
                                                        resetForm.formState
                                                            .errors.code
                                                            ?.message
                                                    }
                                                    value={value}
                                                    onChangeText={onChange}
                                                    onBlur={onBlur}
                                                    placeholder="000000"
                                                    keyboardType="number-pad"
                                                    maxLength={6}
                                                />
                                            )}
                                        />

                                        <Controller
                                            control={resetForm.control}
                                            name="password"
                                            rules={{
                                                required: "New password is required.",
                                                minLength: {
                                                    value: 6,
                                                    message:
                                                        "Password must be at least 6 characters.",
                                                },
                                            }}
                                            render={({
                                                field: {
                                                    onChange,
                                                    onBlur,
                                                    value,
                                                },
                                            }) => (
                                                <FormField
                                                    label="New password"
                                                    icon={Lock}
                                                    error={
                                                        resetForm.formState
                                                            .errors.password
                                                            ?.message
                                                    }
                                                    value={value}
                                                    onChangeText={onChange}
                                                    onBlur={onBlur}
                                                    placeholder="Create a new password"
                                                    autoCapitalize="none"
                                                    autoComplete="new-password"
                                                    secureTextEntry={
                                                        !showPassword
                                                    }
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
                                                                    color={
                                                                        colors.muted
                                                                    }
                                                                    size={20}
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                />
                                                            ) : (
                                                                <Eye
                                                                    color={
                                                                        colors.muted
                                                                    }
                                                                    size={20}
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                />
                                                            )}
                                                        </Pressable>
                                                    }
                                                />
                                            )}
                                        />

                                        <Controller
                                            control={resetForm.control}
                                            name="confirmPassword"
                                            rules={{
                                                required:
                                                    "Confirm your new password.",
                                                validate: (value) =>
                                                    value ===
                                                        resetForm.getValues(
                                                            "password",
                                                        ) ||
                                                    "Passwords do not match.",
                                            }}
                                            render={({
                                                field: {
                                                    onChange,
                                                    onBlur,
                                                    value,
                                                },
                                            }) => (
                                                <FormField
                                                    label="Confirm new password"
                                                    icon={Lock}
                                                    error={
                                                        resetForm.formState
                                                            .errors
                                                            .confirmPassword
                                                            ?.message
                                                    }
                                                    value={value}
                                                    onChangeText={onChange}
                                                    onBlur={onBlur}
                                                    placeholder="Re-enter new password"
                                                    autoCapitalize="none"
                                                    autoComplete="new-password"
                                                    secureTextEntry={
                                                        !showConfirm
                                                    }
                                                    right={
                                                        <Pressable
                                                            onPress={() =>
                                                                setShowConfirm(
                                                                    (v) => !v,
                                                                )
                                                            }
                                                            hitSlop={8}
                                                            className="p-2"
                                                        >
                                                            {showConfirm ? (
                                                                <EyeOff
                                                                    color={
                                                                        colors.muted
                                                                    }
                                                                    size={20}
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                />
                                                            ) : (
                                                                <Eye
                                                                    color={
                                                                        colors.muted
                                                                    }
                                                                    size={20}
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                />
                                                            )}
                                                        </Pressable>
                                                    }
                                                />
                                            )}
                                        />
                                    </>
                                )}

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
                                    onPress={
                                        step === "email"
                                            ? emailForm.handleSubmit(onSendCode)
                                            : resetForm.handleSubmit(onReset)
                                    }
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
                                            ? step === "email"
                                                ? "Sending..."
                                                : "Resetting..."
                                            : step === "email"
                                              ? "Send reset code"
                                              : "Reset password"}
                                    </Text>
                                </Pressable>
                            </View>

                            {/* Footer */}
                            <View className="mt-8 flex-row items-center justify-center gap-1">
                                <Link
                                    href="/sign-in"
                                    className="text-md font-semibold text-brand-700"
                                >
                                    Back to sign in
                                </Link>
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
