import { useState } from "react";
import {
    HeartPulse,
    ShieldCheck,
    User,
} from "lucide-react-native";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import HealthProfileForm from "@/components/ui/HealthProfileForm";
import { useAppData } from "@/context/AppDataContext";
import { TABS } from "@/lib/guide";
import { BLANK_HEALTH_PROFILE, type HealthProfile } from "@/lib/storage";
import { brand, useAppTheme } from "@/theme";

const TOTAL_STEPS = 3;

function HowToUseStep() {
    return (
        <View>
            <Text className="text-xl font-display-bold text-foreground">
                How to use OwnMed
            </Text>
            <Text className="mt-1 text-sm font-sans text-muted">
                Everything you need lives in these five tabs.
            </Text>
            <View className="mt-4 gap-3">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <View
                            key={tab.label}
                            className="flex-row items-center gap-3 rounded-2xl bg-surface-muted px-4 py-3"
                        >
                            <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10">
                                <Icon
                                    color={brand[600]}
                                    size={20}
                                    strokeWidth={2}
                                />
                            </View>
                            <View className="flex-1">
                                <Text className="text-sm font-semibold text-foreground">
                                    {tab.label}
                                </Text>
                                <Text className="mt-0.5 text-xs leading-snug font-sans text-muted">
                                    {tab.description}
                                </Text>
                            </View>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

function AccountStep() {
    const { colors } = useAppTheme();
    return (
        <View>
            <Text className="text-xl font-display-bold text-foreground">
                Keep your data safe
            </Text>
            <Text className="mt-1 text-sm font-sans text-muted">
                What happens with or without an account.
            </Text>
            <View className="mt-4 gap-3">
                <View className="rounded-2xl border border-border bg-surface-muted p-4">
                    <View className="flex-row items-center gap-2">
                        <User color={colors.muted} size={18} strokeWidth={2} />
                        <Text className="text-sm font-semibold text-foreground">
                            As a guest
                        </Text>
                    </View>
                    <Text className="mt-2 text-xs leading-relaxed font-sans text-muted">
                        Without signing in, your medicines and health details
                        are saved only on this device. Uninstalling the app
                        removes them permanently.
                    </Text>
                </View>
                <View className="rounded-2xl border border-brand-600 bg-brand-600/10 p-4">
                    <View className="flex-row items-center gap-2">
                        <ShieldCheck
                            color={brand[600]}
                            size={18}
                            strokeWidth={2}
                        />
                        <Text className="text-sm font-semibold text-brand-700">
                            With an account
                        </Text>
                    </View>
                    <Text className="mt-2 text-xs leading-relaxed font-sans text-muted">
                        Create an account to securely back up your data and
                        access it after reinstalling the app.
                    </Text>
                </View>
            </View>
        </View>
    );
}

export default function OnboardingModal() {
    const { hydrated, onboarded, completeOnboarding, skipOnboarding } =
        useAppData();

    const [step, setStep] = useState(0);
    /**
     * The health answers, held here until "Get started" commits them — which is
     * why the form below is controlled rather than owning its own state. Skip
     * discards them, and that is the intent rather than an oversight.
     */
    const [profile, setProfile] = useState<HealthProfile>(BLANK_HEALTH_PROFILE);

    const visible = hydrated && !onboarded;

    const handleGetStarted = () => {
        completeOnboarding(profile);
    };

    // Mount only when it should actually be visible. Keeping the modal mounted
    // with `visible={false}` and flipping it true later is unreliable on
    // Android (RN 0.86 / new architecture) — the dialog never appears.
    if (!visible) {
        return null;
    }

    return (
        <Modal
            transparent
            visible
            animationType="fade"
            onRequestClose={() => {}}
        >
            <View className="flex-1 justify-center bg-black/50 px-6">
                <View className="max-h-[90%] overflow-hidden rounded-3xl border border-border bg-surface">
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <View className="p-6">
                            {/* Header + progress */}
                            <View className="flex-row items-center justify-between">
                                <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
                                    <HeartPulse
                                        color="#ffffff"
                                        size={20}
                                        strokeWidth={2}
                                    />
                                </View>
                                <Text className="text-xs font-medium text-muted">
                                    Step {step + 1} of {TOTAL_STEPS}
                                </Text>
                            </View>

                            <View className="mt-4 flex-row gap-1.5">
                                {Array.from({ length: TOTAL_STEPS }).map(
                                    (_, i) => (
                                        <View
                                            key={i}
                                            className={[
                                                "h-1.5 flex-1 rounded-full",
                                                i <= step
                                                    ? "bg-brand-600"
                                                    : "bg-surface-muted",
                                            ].join(" ")}
                                        />
                                    ),
                                )}
                            </View>

                            {/* Step content */}
                            <View className="mt-6">
                                {step === 0 && <HowToUseStep />}
                                {step === 1 && <AccountStep />}
                                {step === 2 && (
                                    <View>
                                        <Text className="text-xl font-display-bold text-foreground">
                                            A few details
                                        </Text>
                                        <Text className="mt-1 text-sm font-sans text-muted">
                                            Height and weight give you a BMI on
                                            the dashboard. You can skip this.
                                        </Text>

                                        <View className="mt-4">
                                            <HealthProfileForm
                                                value={profile}
                                                onChange={setProfile}
                                            />
                                        </View>
                                    </View>
                                )}
                            </View>

                            {/* Actions */}
                            <View className="mt-6 gap-3">
                                <View className="flex-row gap-3">
                                    {step > 0 && (
                                        <Pressable
                                            onPress={() => setStep(step - 1)}
                                            className="flex-1 items-center justify-center rounded-2xl border border-border bg-surface py-4"
                                        >
                                            <Text className="text-base font-semibold text-foreground">
                                                Back
                                            </Text>
                                        </Pressable>
                                    )}
                                    {step < TOTAL_STEPS - 1 ? (
                                        <Pressable
                                            onPress={() => setStep(step + 1)}
                                            className="flex-1 items-center justify-center rounded-2xl bg-brand-600 py-4"
                                        >
                                            <Text className="text-base font-semibold text-white">
                                                Next
                                            </Text>
                                        </Pressable>
                                    ) : (
                                        <Pressable
                                            onPress={handleGetStarted}
                                            android_ripple={{
                                                color: "rgba(255,255,255,0.15)",
                                            }}
                                            style={{
                                                shadowColor: brand[600],
                                                shadowOpacity: 0.35,
                                                shadowRadius: 12,
                                                shadowOffset: {
                                                    width: 0,
                                                    height: 6,
                                                },
                                                elevation: 4,
                                            }}
                                            className="flex-1 items-center justify-center rounded-2xl bg-brand-600 py-4"
                                        >
                                            <Text className="text-base font-semibold text-white">
                                                Get started
                                            </Text>
                                        </Pressable>
                                    )}
                                </View>
                                <Pressable
                                    onPress={skipOnboarding}
                                    hitSlop={8}
                                    className="items-center justify-center py-2"
                                >
                                    <Text className="text-sm font-semibold text-muted">
                                        Skip for now
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}
