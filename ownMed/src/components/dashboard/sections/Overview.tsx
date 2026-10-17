import { useState } from "react";
import {
    Activity,
    Droplet,
    Pencil,
    Ruler,
    User,
    Weight,
    type LucideIcon,
} from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import HealthProfileModal from "@/components/dashboard/sections/HealthProfileModal";
import { useAppData } from "@/context/AppDataContext";
import {
    BMI_GAUGE_BANDS,
    bmi,
    bmiCategory,
    bmiGuidance,
    bmiScalePosition,
    type BmiGuidance,
    type BmiTone,
} from "@/lib/health";
import type { HealthProfile } from "@/lib/storage";
import { brand, useAppTheme } from "@/theme";

/**
 * The status palette as class names.
 *
 * Spelled out in full rather than built from the tone with a template string:
 * Tailwind finds classes by scanning the source, so `` `bg-${tone}` `` compiles
 * to nothing at all and the gauge would come out uncoloured.
 */
const TONE_BG: Record<BmiTone, string> = {
    info: "bg-info",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
};

const TONE_PILL: Record<BmiTone, string> = {
    info: "bg-info/10",
    success: "bg-success/10",
    warning: "bg-warning/10",
    danger: "bg-danger/10",
};

const TONE_TEXT: Record<BmiTone, string> = {
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
};

type Fact = {
    id: string;
    icon: LucideIcon;
    label: string;
    value: string;
};

/** A measurement as it should read, or "Not set" when there is none. */
function measurement(value: string | undefined, unit: string): string {
    return value ? `${value} ${unit}` : "Not set";
}

/** Kilograms as an instruction reads: "7", not "7.0"; "7.5" when it is one. */
function formatKg(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * The BMI in plain words, plus the one number to act on.
 *
 * The direction and the kilograms are the rule — `lib/health.ts` computes them —
 * while which sentence says it is presentation and belongs here.
 */
function guidanceNote(guidance: BmiGuidance): {
    headline: string;
    detail: string;
} {
    switch (guidance.kind) {
        case "gain":
            return {
                headline: "Your BMI is below the healthy range.",
                detail: `Reaching it means gaining about ${formatKg(guidance.kg)} kg.`,
            };
        case "lose":
            return {
                headline: "Your BMI is above the healthy range.",
                detail: `Reaching it means losing about ${formatKg(guidance.kg)} kg.`,
            };
        case "healthy":
            return {
                headline: "Your BMI is in the healthy range.",
                detail: `A healthy weight for your height is about ${formatKg(guidance.minKg)}–${formatKg(guidance.maxKg)} kg.`,
            };
    }
}

/**
 * The four facts the overview is built from, in the order onboarding asks for
 * them. Every one is shown even when blank: four "Not set" cells are a list of
 * what is missing, which a card that simply omitted them could not say.
 *
 * `gender` is displayed capitalised purely because it is stored lowercase for
 * the wire — the value itself is unchanged, so this stays a presentation
 * concern rather than a third spelling of "male" to keep in step.
 */
function factsOf(profile: HealthProfile | null): Fact[] {
    const gender = profile?.gender ?? "";
    return [
        {
            id: "height",
            icon: Ruler,
            label: "Height",
            value: measurement(profile?.heightCm, "cm"),
        },
        {
            id: "weight",
            icon: Weight,
            label: "Weight",
            value: measurement(profile?.weightKg, "kg"),
        },
        {
            id: "bloodGroup",
            icon: Droplet,
            label: "Blood group",
            value: profile?.bloodGroup || "Not set",
        },
        {
            id: "gender",
            icon: User,
            label: "Gender",
            value: gender === "" ? "Not set" : gender[0].toUpperCase() + gender.slice(1),
        },
    ];
}

function FactCell({ fact }: { fact: Fact }) {
    const Icon = fact.icon;
    return (
        <View className="w-[47%] flex-row items-center gap-3 rounded-3xl border border-border bg-surface p-4">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10">
                <Icon color={brand[600]} size={20} strokeWidth={2} />
            </View>
            <View className="flex-1">
                <Text className="text-xs font-sans text-muted">{fact.label}</Text>
                <Text
                    numberOfLines={1}
                    className="mt-0.5 text-sm font-semibold text-foreground"
                >
                    {fact.value}
                </Text>
            </View>
        </View>
    );
}

/**
 * The BMI card: the number, the band it falls in, and the scale it was placed
 * on.
 *
 * The band names are a **legend under the bar rather than labels on it**. On a
 * phone the underweight segment is about 38 px wide, so "Underweight" printed
 * inside its own segment would wrap or spill; gathered underneath they also say
 * what the other three colours mean, which a label on the current band alone
 * could not. The current band is picked out in bold, so the legend doubles as
 * the answer to "where am I".
 */
function BmiCard({
    value,
    guidance,
}: {
    value: number;
    guidance: BmiGuidance | null;
}) {
    const category = bmiCategory(value);
    const position = bmiScalePosition(value);
    const note = guidance ? guidanceNote(guidance) : null;

    return (
        <View className="mt-5 rounded-3xl border border-border bg-surface p-5">
            <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                    <Text className="text-xs font-medium uppercase tracking-wider text-muted">
                        Body mass index
                    </Text>
                    <View className="mt-1 flex-row items-baseline gap-1.5">
                        <Text className="text-4xl font-display-bold text-foreground">
                            {value.toFixed(1)}
                        </Text>
                        <Text className="text-sm font-sans text-muted">
                            kg/m²
                        </Text>
                    </View>
                </View>
                <View
                    className={`rounded-full px-3 py-1 ${TONE_PILL[category.tone]}`}
                >
                    <Text
                        className={`text-xs font-semibold ${TONE_TEXT[category.tone]}`}
                    >
                        {category.label}
                    </Text>
                </View>
            </View>

            {/* The bar. The rounding lives on the track with `overflow-hidden`
                over it, which is what turns four square segments into one
                gauge — rounding each segment would draw a seam at every
                boundary. */}
            <View className="relative mt-5">
                <View className="h-3 flex-row overflow-hidden rounded-full">
                    {BMI_GAUGE_BANDS.map((band) => (
                        <View
                            key={band.id}
                            className={TONE_BG[band.tone]}
                            style={{ flex: band.weight }}
                        />
                    ))}
                </View>

                {/* The needle. `left` is a percentage of the track and the
                    negative margin is half the needle's own width, so a reading
                    at either end lands *on* the end rather than hanging past
                    it. */}
                <View
                    className="absolute h-5 w-1.5 rounded-full bg-foreground"
                    style={{
                        top: -4,
                        left: `${position * 100}%`,
                        marginLeft: -3,
                    }}
                />
            </View>

            <View className="mt-3 flex-row flex-wrap gap-x-3 gap-y-1.5">
                {BMI_GAUGE_BANDS.map((band) => {
                    const current = band.id === category.id;
                    return (
                        <View
                            key={band.id}
                            className="flex-row items-center gap-1.5"
                        >
                            <View
                                className={`h-1.5 w-1.5 rounded-full ${TONE_BG[band.tone]}`}
                            />
                            <Text
                                className={
                                    current
                                        ? "text-[11px] font-semibold text-foreground"
                                        : "text-[11px] font-sans text-muted"
                                }
                            >
                                {band.label}
                            </Text>
                        </View>
                    );
                })}
            </View>

            {/* The card so far has said the number and coloured a bar; neither
                tells someone who does not already know the cut-offs whether
                that is good news or how far they are from it. This says it in
                words and in kilograms. */}
            {note ? (
                <View className="mt-4 rounded-2xl bg-surface-muted px-4 py-3">
                    <Text className="text-sm font-sans text-muted">
                        {note.headline}
                    </Text>
                    <Text className="mt-1 text-sm font-medium text-foreground">
                        {note.detail}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

/**
 * What the card becomes when there is no BMI to show.
 *
 * Deliberately not a zero or a placeholder number: a height and weight this app
 * has never been told are exactly the case where a real figure would be
 * invented, and an invented figure on a health screen is worse than a gap. The
 * facts below still render, so the user can see which one is missing.
 *
 * The button is the point of the whole card. Skipping the onboarding health step
 * used to be a one-way door — this state was all the user ever saw — so the
 * empty state carries the way back in rather than only describing the gap.
 */
function EmptyBmi({ onAdd }: { onAdd: () => void }) {
    return (
        <View className="mt-5 items-center rounded-3xl border border-border bg-surface px-5 py-8">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/10">
                <Activity color={brand[600]} size={24} strokeWidth={2} />
            </View>
            <Text className="mt-3 text-base font-semibold text-foreground">
                No BMI yet
            </Text>
            <Text className="mt-1 text-center text-sm leading-relaxed font-sans text-muted">
                Add your height and weight to see your body mass index here.
            </Text>
            <Pressable
                onPress={onAdd}
                android_ripple={{ color: "rgba(255,255,255,0.15)" }}
                className="mt-4 rounded-2xl bg-brand-600 px-5 py-3"
            >
                <Text className="text-sm font-semibold text-white">
                    Add your details
                </Text>
            </Pressable>
        </View>
    );
}

export default function Overview() {
    const { healthProfile } = useAppData();
    const [editing, setEditing] = useState(false);

    // Null until both measurements are on file — `bmi` is what decides that,
    // so the empty state and the figure can never disagree about whether there
    // is enough to work with.
    const bmiValue = healthProfile
        ? bmi(healthProfile.heightCm, healthProfile.weightKg)
        : null;
    // Computed from the same two fields as `bmiValue`; null exactly when there
    // is no reading to explain.
    const guidance = healthProfile
        ? bmiGuidance(healthProfile.heightCm, healthProfile.weightKg)
        : null;

    const facts = factsOf(healthProfile);
    const { colors } = useAppTheme();

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            className="flex-1"
        >
            <View className="px-6 pt-6">
                {/* The title row doubles as the edit affordance, so the control
                    sits where the user is already looking rather than as a
                    floating button over the scroll content. It is offered
                    whether or not there is a BMI: correcting a value is as much
                    the point as filling one in. */}
                <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                        <Text className="text-2xl font-display-bold text-foreground">
                            Overview
                        </Text>
                        <Text className="mt-1 text-sm font-sans text-muted">
                            Your health at a glance.
                        </Text>
                    </View>
                    <Pressable
                        onPress={() => setEditing(true)}
                        hitSlop={8}
                        className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2"
                    >
                        <Pencil color={brand[600]} size={14} strokeWidth={2} />
                        <Text className="text-sm font-semibold text-brand-700">
                            Edit
                        </Text>
                    </Pressable>
                </View>

                {bmiValue === null ? (
                    <EmptyBmi onAdd={() => setEditing(true)} />
                ) : (
                    <BmiCard value={bmiValue} guidance={guidance} />
                )}

                <Text className="mt-6 text-lg font-semibold text-foreground">
                    Your details
                </Text>
                <View className="mt-3 flex-row flex-wrap justify-between gap-y-3">
                    {facts.map((fact) => (
                        <FactCell key={fact.id} fact={fact} />
                    ))}
                </View>

                <View className="mt-6 flex-row items-start gap-3 rounded-3xl bg-surface-muted px-4 py-3">
                    <Activity
                        color={colors.muted}
                        size={20}
                        strokeWidth={2}
                    />
                    <Text className="flex-1 text-xs leading-relaxed font-sans text-muted">
                        BMI is a rough guide for adults. It does not account for
                        muscle, pregnancy or age, so ask a doctor what your
                        numbers mean for you.
                    </Text>
                </View>
            </View>

            {/* Mounted only while open, like the onboarding walkthrough: a modal
                kept mounted with `visible={false}` and flipped open later does
                not appear on Android (RN 0.86 / new architecture). */}
            {editing && (
                <HealthProfileModal onClose={() => setEditing(false)} />
            )}
        </ScrollView>
    );
}
