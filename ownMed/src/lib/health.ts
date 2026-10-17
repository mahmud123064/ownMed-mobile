/**
 * The health-profile facts, and the maths the dashboard draws from them.
 *
 * Pure by design — no storage, no network, no React — the same split as
 * `medicineSchedule.ts` and `notices.ts`: the rules live here so they can be
 * reasoned about on their own, and `Overview` owns only the presentation.
 *
 * BMI is the one derived value, and it is deliberately **gender-neutral**. There
 * is no sex-adjusted formula here: the cut-offs below are the standard ones and
 * are the same for everyone, so `gender` and `bloodGroup` are rendered beside
 * the result as facts rather than fed into it.
 */

/** The eight ABO/Rh labels — the one place they are written down on this side. */
export const BLOOD_GROUPS = [
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-",
] as const;

/**
 * The ends of the gauge's scale, in kg/m².
 *
 * The scale does not run from zero. Nobody a dashboard should plot has a BMI
 * under 15, and giving that range most of the bar would squeeze every real
 * reading into the last sliver; 40 is the other end for the same reason, since
 * beyond it the number stops saying anything the band does not already.
 */
export const BMI_SCALE_MIN = 15;
export const BMI_SCALE_MAX = 40;

/**
 * The healthy band's edges, in kg/m² — WHO's, and the same for every adult.
 *
 * Exported because the Overview's guidance ("lose about N kg to reach the
 * healthy range") is measured to these same two numbers. A second copy of 18.5
 * and 25 over there would let the gauge and the advice disagree the first time
 * a cut-off moved.
 */
export const HEALTHY_BMI_MIN = 18.5;
export const HEALTHY_BMI_MAX = 25;

/** The cut-offs between bands, in kg/m² — the healthy edges are the two above. */
const UNDERWEIGHT_BELOW = HEALTHY_BMI_MIN;
const HEALTHY_BELOW = HEALTHY_BMI_MAX;
const OVERWEIGHT_BELOW = 30;

/**
 * The four bands in scale order — the one place they are written down.
 *
 * `bmiCategory` picks one by cut-off and the gauge draws its segments from the
 * same list, so the colour under the marker is by construction the colour of the
 * category named above it. `label` for the healthy band reads "Healthy" rather
 * than "Normal": it is the one band that is good news, and the clinical word for
 * it sounds like a diagnosis sitting next to the other three.
 */
const BMI_BANDS = [
    {
        id: "underweight",
        label: "Underweight",
        tone: "info",
        endsAt: UNDERWEIGHT_BELOW,
    },
    { id: "normal", label: "Healthy", tone: "success", endsAt: HEALTHY_BELOW },
    {
        id: "overweight",
        label: "Overweight",
        tone: "warning",
        endsAt: OVERWEIGHT_BELOW,
    },
    { id: "obese", label: "Obese", tone: "danger", endsAt: BMI_SCALE_MAX },
] as const;

export type BmiBandId = (typeof BMI_BANDS)[number]["id"];

/** The status palette a band is drawn in; maps to Tailwind's `info`/`success`/… */
export type BmiTone = (typeof BMI_BANDS)[number]["tone"];

export type BmiCategory = {
    id: BmiBandId;
    label: string;
    tone: BmiTone;
};

/** A band as the gauge needs it: the same facts plus how wide its segment is. */
export type BmiGaugeBand = BmiCategory & { weight: number };

/**
 * A stored measurement as a positive number, or null when it is not one.
 *
 * Every field of `HealthProfile` is a string — it is what the user typed, and
 * the server column is text — so the conversion belongs here rather than at each
 * call site. `""`, `"abc"` and a bare `"0"` are all null rather than zero: all
 * three mean "no measurement", and reading them as zero would divide by nothing
 * and then report a BMI nobody took.
 *
 * A negative number is rejected for the same reason. A height in the wrong unit
 * is *not* — `"1.7"` in a centimetre field is a real typo this cannot detect,
 * and the honest answer is to compute the absurd number it asks for and let the
 * user see it, rather than to guess which unit they meant.
 */
function positiveNumber(value: string): number | null {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Round to one decimal place — the precision the guidance is spoken in. */
function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

/**
 * Body mass index, or null when it cannot be computed.
 *
 * `weight / height²`, with the height converted from the centimetres the form
 * collects to the metres the formula wants — doing that conversion in one place
 * is the reason this is a function at all.
 */
export function bmi(heightCm: string, weightKg: string): number | null {
    const height = positiveNumber(heightCm);
    const weight = positiveNumber(weightKg);
    if (height === null || weight === null) return null;

    const metres = height / 100;
    return weight / (metres * metres);
}

/** Which band a BMI falls in. */
export function bmiCategory(value: number): BmiCategory {
    // The last band has no upper cut-off, so `find` only misses a value that is
    // not a number at all — `NaN` fails every comparison. "Obese" is the wrong
    // answer there, but `bmi()` never returns `NaN`, so the fallback is for the
    // return type rather than for a case that can reach it.
    const band = BMI_BANDS.find((entry) => value < entry.endsAt) ?? BMI_BANDS[3];
    return { id: band.id, label: band.label, tone: band.tone };
}

/**
 * Where a BMI sits on the gauge, as a fraction from 0 (left) to 1 (right).
 *
 * Values off either end are **clamped rather than dropped**: the marker belongs
 * at the end of the bar it ran past, and the number above it still says exactly
 * how far past. Returning null instead would leave a user with a real, if
 * extreme, reading looking at an empty gauge.
 */
export function bmiScalePosition(value: number): number {
    const fraction = (value - BMI_SCALE_MIN) / (BMI_SCALE_MAX - BMI_SCALE_MIN);
    return Math.min(1, Math.max(0, fraction));
}

/**
 * How far a reading is from the healthy band, and in which direction — the
 * shape the dashboard turns into "lose about 7 kg".
 */
export type BmiGuidance =
    | { kind: "gain"; kg: number }
    | { kind: "lose"; kg: number }
    | { kind: "healthy"; minKg: number; maxKg: number };

/**
 * What the reading means in weight terms: how far it is from the healthy band,
 * and in which direction.
 *
 * The card can say "23.4" and colour a bar, but neither tells someone who does
 * not already know the cut-offs whether that is good news or how much they are
 * from it. Turning the BMI back into kilograms — the unit on the scale in the
 * bathroom — is the one actionable statement the numbers support.
 *
 * Measured to the *nearest* edge of the healthy band (18.5 at the bottom, 25 at
 * the top), not to its middle: "reach the range" is what the advice says, and
 * the smallest change that gets there is the least discouraging true answer.
 * Rounding to one decimal means a delta under 0.05 kg reads as already healthy
 * rather than as "lose 0 kg".
 *
 * `null` when a measurement cannot be read, mirroring `bmi` — the caller has
 * no guidance to give in that case, exactly as it has no BMI to show.
 */
export function bmiGuidance(
    heightCm: string,
    weightKg: string,
): BmiGuidance | null {
    const height = positiveNumber(heightCm);
    const weight = positiveNumber(weightKg);
    if (height === null || weight === null) return null;

    const metres = height / 100;
    const minKg = HEALTHY_BMI_MIN * metres * metres;
    const maxKg = HEALTHY_BMI_MAX * metres * metres;

    // Subtracting and rounding rather than comparing the raw BMI keeps this
    // answer and the kg figure derived from the same arithmetic, so they can
    // never say "above" and then quote 0 kg.
    const gain = round1(minKg - weight);
    if (gain > 0) return { kind: "gain", kg: gain };

    const lose = round1(weight - maxKg);
    if (lose > 0) return { kind: "lose", kg: lose };

    return { kind: "healthy", minKg: round1(minKg), maxKg: round1(maxKg) };
}

/**
 * The gauge's segments, each with the width of its slice as a flex weight.
 *
 * Derived from the same cut-offs `bmiCategory` uses rather than written out as
 * percentages: a hand-written "14 / 26 / 20 / 40" would be a second copy of the
 * scale, and the marker would start disagreeing with its own label the first
 * time a cut-off moved.
 */
export const BMI_GAUGE_BANDS: BmiGaugeBand[] = BMI_BANDS.map((band, index) => ({
    id: band.id,
    label: band.label,
    tone: band.tone,
    weight:
        band.endsAt - (index === 0 ? BMI_SCALE_MIN : BMI_BANDS[index - 1].endsAt),
}));

/** Centimetres in an inch. */
const CM_PER_INCH = 2.54;

/**
 * A stored centimetre height as feet and inches, or null when it is not one.
 *
 * The profile keeps `heightCm` in centimetres regardless of how it was typed;
 * this is the one conversion the form needs to show that value in the unit some
 * people think in. Rounded to the nearest whole inch first, so 170 cm reads as
 * 5 ft 7 in rather than 5 ft 6.9 in — nobody quotes a fraction of an inch.
 */
export function cmToFeetInches(
    cm: string,
): { feet: number; inches: number } | null {
    const value = positiveNumber(cm);
    if (value === null) return null;

    const totalInches = Math.round(value / CM_PER_INCH);
    return {
        feet: Math.floor(totalInches / 12),
        inches: totalInches % 12,
    };
}

/**
 * Feet and inches as whole centimetres, or null when there is no height there.
 *
 * Rounded to a whole centimetre deliberately: it makes the round trip stable
 * (170 cm → 5 ft 7 in → 170 cm), where storing 170.18 would show a height the
 * user never typed when they switched back. `null` covers both "both empty"
 * (zero inches) and junk, which the form reads as "no height yet".
 */
export function feetInchesToCm(
    feet: number,
    inches: number,
): number | null {
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
    if (feet < 0 || inches < 0) return null;

    const totalInches = feet * 12 + inches;
    if (totalInches <= 0) return null;

    return Math.round(totalInches * CM_PER_INCH);
}
