import { useState } from "react";
import { HeartPulse } from "lucide-react-native";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import HealthProfileForm from "@/components/ui/HealthProfileForm";
import { useAppData } from "@/context/AppDataContext";
import { BLANK_HEALTH_PROFILE, type HealthProfile } from "@/lib/storage";
import { brand } from "@/theme";

/**
 * The Overview's edit surface for the health details.
 *
 * It exists because the onboarding walkthrough was the *only* place these four
 * questions were ever asked: a user who tapped "Skip for now" had no way back to
 * them, and the Overview could only show "No BMI yet" over cells reading "Not
 * set" with nothing to tap. Correcting a mistyped height or a weight that has
 * changed is the same missing path, so this is offered whenever the section is,
 * not only while the profile is blank.
 *
 * It renders the **same** `HealthProfileForm` the onboarding step does, so the
 * two cannot drift — the form they share is the one place those four fields are
 * laid out.
 *
 * Like `OnboardingModal`, the caller mounts this only while it should be open
 * and the modal here is always `visible`. Keeping it mounted with
 * `visible={false}` and flipping the prop is unreliable on Android (RN 0.86 /
 * new architecture) — the dialog simply never appears. Unmounting is what also
 * gives a fresh open its own state, which is why the seeding below reads the
 * profile once at mount rather than syncing it in an effect: a cancelled edit
 * must not leave half-typed values behind for the next open.
 */
export default function HealthProfileModal({
    onClose,
}: {
    onClose: () => void;
}) {
    const { healthProfile, updateHealthProfile } = useAppData();

    // `healthProfile` is legitimately null here: skipping onboarding leaves it
    // that way, and that user is the main reason this modal exists.
    const [profile, setProfile] = useState<HealthProfile>(
        healthProfile ?? BLANK_HEALTH_PROFILE,
    );

    const handleSave = () => {
        updateHealthProfile(profile);
        onClose();
    };

    return (
        <Modal
            transparent
            visible
            animationType="fade"
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-center bg-black/50 px-6">
                <View className="max-h-[90%] overflow-hidden rounded-3xl border border-border bg-surface">
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <View className="p-6">
                            <View className="flex-row items-center gap-3">
                                <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
                                    <HeartPulse
                                        color="#ffffff"
                                        size={20}
                                        strokeWidth={2}
                                    />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-xl font-display-bold text-foreground">
                                        Your health details
                                    </Text>
                                    <Text className="mt-0.5 text-xs font-sans text-muted">
                                        Used for your BMI. Every field is
                                        optional.
                                    </Text>
                                </View>
                            </View>

                            <View className="mt-5">
                                <HealthProfileForm
                                    value={profile}
                                    onChange={setProfile}
                                />
                            </View>

                            <View className="mt-6 flex-row gap-3">
                                <Pressable
                                    onPress={onClose}
                                    className="flex-1 items-center justify-center rounded-2xl border border-border bg-surface py-4"
                                >
                                    <Text className="text-base font-semibold text-foreground">
                                        Cancel
                                    </Text>
                                </Pressable>
                                <Pressable
                                    onPress={handleSave}
                                    android_ripple={{
                                        color: "rgba(255,255,255,0.15)",
                                    }}
                                    style={{
                                        shadowColor: brand[600],
                                        shadowOpacity: 0.35,
                                        shadowRadius: 12,
                                        shadowOffset: { width: 0, height: 6 },
                                        elevation: 4,
                                    }}
                                    className="flex-1 items-center justify-center rounded-2xl bg-brand-600 py-4"
                                >
                                    <Text className="text-base font-semibold text-white">
                                        Save
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
