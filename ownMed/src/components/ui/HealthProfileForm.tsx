import { useState } from "react";
import { Droplet, Ruler, Weight } from "lucide-react-native";
import { Text, TextInput, View } from "react-native";

import Chip from "@/components/ui/Chip";
import FormField from "@/components/ui/FormField";
import {
    BLOOD_GROUPS,
    cmToFeetInches,
    feetInchesToCm,
} from "@/lib/health";
import type { HealthProfile } from "@/lib/storage";
import { useAppTheme } from "@/theme";

/**
 * The two genders the health profile records.
 *
 * Narrower than the account Profile's list, which also offers "other": this is
 * the context a BMI result is read in rather than the person's own identity
 * record, and the account form is where that is answered. Kept as a value list
 * so a new option cannot be added here without the `HealthProfileGender` union
 * in `lib/storage.ts` moving with it.
 */
const GENDERS = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
] as const;

/** A height sub-field's text as a number; blank is zero, junk is NaN. */
function numberOrZero(text: string): number {
    const trimmed = text.trim();
    return trimmed === "" ? 0 : Number(trimmed);
}

/**
 * The height / weight / blood-group / gender fields, as one controlled form.
 *
 * Shared by the onboarding walkthrough and the Overview's edit modal, which is
 * the whole reason it exists: these four questions were asked in exactly one
 * place, and the second caller would otherwise have been a copy of the first —
 * two forms whose chip rows, order and labels would drift apart on the first
 * change to either.
 *
 * It owns no *profile* state and has no Save button: the caller owns both, so
 * onboarding can treat the values as work-in-progress until "Get started" and
 * the modal can Save or Cancel them. `onChange` always hands back a complete
 * profile, so a caller never has to merge a single field itself. The only local
 * state is which unit the height is being typed in — a display preference that
 * is converted back to `heightCm` before it leaves.
 */
export default function HealthProfileForm({
    value,
    onChange,
}: {
    value: HealthProfile;
    onChange: (next: HealthProfile) => void;
}) {
    const { colors } = useAppTheme();

    // The unit is a property of how this form is being filled in, not of the
    // profile: `heightCm` is what is stored either way. It starts at cm on
    // every open, so anyone who never touches the toggle sees exactly the form
    // they saw before.
    const [heightUnit, setHeightUnit] = useState<"cm" | "ftIn">("cm");
    const [feet, setFeet] = useState("");
    const [inches, setInches] = useState("");

    const setField = (patch: Partial<HealthProfile>) =>
        onChange({ ...value, ...patch });

    /** Write a feet/inches pair back as the single cm string the profile stores. */
    const applyFeetInches = (nextFeet: string, nextInches: string) => {
        const cm = feetInchesToCm(
            numberOrZero(nextFeet),
            numberOrZero(nextInches),
        );
        setField({ heightCm: cm === null ? "" : String(cm) });
    };

    /**
     * Flip the height unit, seeding the ft/in inputs from the stored value.
     *
     * Seeding happens on the switch rather than in an effect on purpose: an
     * effect re-deriving feet/inches from `value.heightCm` would run after
     * every keystroke and rewrite what the user just typed, making the two
     * inputs fight them. Switching back to cm needs no seeding — that input
     * reads `value.heightCm` directly.
     */
    const selectHeightUnit = (next: "cm" | "ftIn") => {
        setHeightUnit(next);
        if (next === "cm") return;

        const parsed = cmToFeetInches(value.heightCm);
        setFeet(parsed ? String(parsed.feet) : "");
        setInches(parsed ? String(parsed.inches) : "");
    };

    return (
        <View className="gap-4">
            <View className="gap-2">
                <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-1.5">
                        <Ruler color={colors.muted} size={14} strokeWidth={2} />
                        <Text className="text-sm font-medium text-foreground">
                            Height
                        </Text>
                    </View>
                    <View className="flex-row gap-1.5">
                        <Chip
                            label="cm"
                            active={heightUnit === "cm"}
                            onPress={() => selectHeightUnit("cm")}
                        />
                        <Chip
                            label="ft / in"
                            active={heightUnit === "ftIn"}
                            onPress={() => selectHeightUnit("ftIn")}
                        />
                    </View>
                </View>

                {heightUnit === "cm" ? (
                    <FormField
                        label=""
                        icon={Ruler}
                        value={value.heightCm}
                        onChangeText={(heightCm) => setField({ heightCm })}
                        placeholder="e.g. 170"
                        keyboardType="numeric"
                    />
                ) : (
                    <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4">
                        <Ruler
                            color={colors.muted}
                            size={20}
                            strokeWidth={2}
                        />
                        <TextInput
                            value={feet}
                            onChangeText={(next) => {
                                setFeet(next);
                                applyFeetInches(next, inches);
                            }}
                            placeholder="0"
                            placeholderTextColor={colors.muted}
                            keyboardType="numeric"
                            className="flex-1 py-3 text-base text-foreground"
                        />
                        <Text className="text-sm font-sans text-muted">ft</Text>
                        <TextInput
                            value={inches}
                            onChangeText={(next) => {
                                setInches(next);
                                applyFeetInches(feet, next);
                            }}
                            placeholder="0"
                            placeholderTextColor={colors.muted}
                            keyboardType="numeric"
                            className="w-14 py-3 text-base text-foreground"
                        />
                        <Text className="text-sm font-sans text-muted">in</Text>
                    </View>
                )}
            </View>

            <FormField
                label="Weight (kg)"
                icon={Weight}
                value={value.weightKg}
                onChangeText={(weightKg) => setField({ weightKg })}
                placeholder="e.g. 68"
                keyboardType="numeric"
            />

            {/* Blood group and gender are chips rather than text fields because
                both are a choice from a short known list, and picking cannot
                produce a value the server would reject. Tapping the selected
                chip clears it: every field is optional (the user may skip the
                whole step), so a mis-tap has to be undoable and there is no
                "none" chip to reach for instead. */}
            <View className="gap-2">
                <View className="flex-row items-center gap-1.5">
                    <Droplet color={colors.muted} size={14} strokeWidth={2} />
                    <Text className="text-sm font-medium text-foreground">
                        Blood group
                    </Text>
                </View>
                <View className="flex-row flex-wrap gap-2">
                    {BLOOD_GROUPS.map((group) => (
                        <Chip
                            key={group}
                            label={group}
                            active={value.bloodGroup === group}
                            onPress={() =>
                                setField({
                                    bloodGroup:
                                        value.bloodGroup === group ? "" : group,
                                })
                            }
                        />
                    ))}
                </View>
            </View>

            <View className="gap-2">
                <Text className="text-sm font-medium text-foreground">
                    Gender
                </Text>
                <View className="flex-row gap-2">
                    {GENDERS.map((option) => (
                        <Chip
                            key={option.value}
                            label={option.label}
                            active={value.gender === option.value}
                            onPress={() =>
                                setField({
                                    gender:
                                        value.gender === option.value
                                            ? ""
                                            : option.value,
                                })
                            }
                        />
                    ))}
                </View>
            </View>
        </View>
    );
}
