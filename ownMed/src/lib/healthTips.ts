import {
    Activity,
    Apple,
    BedDouble,
    BicepsFlexed,
    Bike,
    BookOpen,
    Brain,
    Clock,
    Coffee,
    CupSoda,
    Droplets,
    Dumbbell,
    Egg,
    EggFried,
    Eye,
    Flower2,
    Footprints,
    HandHeart,
    HeartPulse,
    LampDesk,
    Leaf,
    Moon,
    MoonStar,
    Music,
    PersonStanding,
    Salad,
    Scale,
    Shield,
    Smile,
    Sparkles,
    Sprout,
    Sun,
    Sunrise,
    Timer,
    Trees,
    Utensils,
    Wheat,
    Wind,
    Zap,
    type LucideIcon,
} from "lucide-react-native";

/**
 * The wellness tips shown on the Health Tips tab and the Home page's tip strip.
 *
 * Shared rather than duplicated so the Home page's "Daily wellness tip" and the
 * Health Tips tab's "Tip of the day" always agree. `tipOfTheDay` rotates by
 * calendar day, the same rule the Health Tips tab used to compute inline.
 *
 * Ten per category, so tapping a filter still leaves a full page rather than a
 * lonely card or two. Every icon name here was checked against the installed
 * lucide-react-native (1.52.0) — note `Lungs`, `Grapes` and `BowlChopsticks` do
 * not exist in that release, which is why the substitutes below are used.
 */
export type TipCategoryId = "nutrition" | "sleep" | "activity" | "mind";

export type TipCategory = {
    id: TipCategoryId;
    label: string;
    icon: LucideIcon;
    /** Accent hex used for the section header's icon badge. */
    accent: string;
};

/**
 * The groups the Health Tips tab draws, in the order it draws them.
 *
 * Written down here rather than derived from `TIPS` so the order is a decision
 * (habits of the day first, mood last) instead of an accident of how the tips
 * happen to be listed below.
 */
export const TIP_CATEGORIES: TipCategory[] = [
    { id: "nutrition", label: "Nutrition", icon: Apple, accent: "#16a34a" },
    { id: "sleep", label: "Sleep", icon: Moon, accent: "#7c3aed" },
    { id: "activity", label: "Activity", icon: Dumbbell, accent: "#dc2626" },
    { id: "mind", label: "Mind", icon: Brain, accent: "#f59e0b" },
];

export type HealthTip = {
    id: string;
    icon: LucideIcon;
    title: string;
    description: string;
    /** Accent hex used for the icon badge tint and icon color. */
    accent: string;
    /** Which group on the Health Tips tab this tip is listed under. */
    category: TipCategoryId;
};

export const TIPS: HealthTip[] = [
    // ── Nutrition ────────────────────────────────────────────────────────────
    {
        id: "hydration",
        icon: Droplets,
        title: "Stay hydrated",
        description: "Sip water through the day — aim for about 8 glasses.",
        accent: "#0284c7",
        category: "nutrition",
    },
    {
        id: "nutrition",
        icon: Apple,
        title: "Eat the rainbow",
        description: "Fill half your plate with colorful fruits and veggies.",
        accent: "#16a34a",
        category: "nutrition",
    },
    {
        id: "half-plate",
        icon: Leaf,
        title: "Half your plate",
        description: "Make vegetables the biggest thing at every meal.",
        accent: "#22c55e",
        category: "nutrition",
    },
    {
        id: "protein",
        icon: Egg,
        title: "Protein every meal",
        description: "Beans, fish, eggs or dairy keep you full for longer.",
        accent: "#d97706",
        category: "nutrition",
    },
    {
        id: "whole-grains",
        icon: Wheat,
        title: "Choose whole grains",
        description: "Swapping white for brown adds fiber with no extra effort.",
        accent: "#ca8a04",
        category: "nutrition",
    },
    {
        id: "fiber",
        icon: Sprout,
        title: "More fiber",
        description: "Fruit, beans and greens keep digestion and energy steady.",
        accent: "#65a30d",
        category: "nutrition",
    },
    {
        id: "sugary-drinks",
        icon: CupSoda,
        title: "Cut sugary drinks",
        description: "Water or unsweetened tea instead of soda, even once a day.",
        accent: "#e11d48",
        category: "nutrition",
    },
    {
        id: "breakfast",
        icon: EggFried,
        title: "Don't skip breakfast",
        description: "A simple breakfast steadies hunger through the morning.",
        accent: "#f59e0b",
        category: "nutrition",
    },
    {
        id: "portions",
        icon: Scale,
        title: "Watch portions",
        description: "Serve a plate, then sit down — don't eat from the pack.",
        accent: "#0d9488",
        category: "nutrition",
    },
    {
        id: "mindful-eating",
        icon: Salad,
        title: "Eat mindfully",
        description: "Slow down and taste each bite; stop when you're satisfied.",
        accent: "#14b8a6",
        category: "nutrition",
    },

    // ── Sleep ────────────────────────────────────────────────────────────────
    {
        id: "sleep",
        icon: Moon,
        title: "Sleep well",
        description: "Wind down early for 7–9 hours of restful sleep.",
        accent: "#7c3aed",
        category: "sleep",
    },
    {
        id: "fixed-bedtime",
        icon: Clock,
        title: "Fixed bedtime",
        description: "Same bedtime and wake time, even at the weekend.",
        accent: "#6366f1",
        category: "sleep",
    },
    {
        id: "dim-lights",
        icon: LampDesk,
        title: "Dim the lights",
        description: "Soft light in the evening tells your body night is near.",
        accent: "#a855f7",
        category: "sleep",
    },
    {
        id: "caffeine-curfew",
        icon: Coffee,
        title: "Caffeine curfew",
        description: "Skip coffee after mid-afternoon so it's gone by bedtime.",
        accent: "#92400e",
        category: "sleep",
    },
    {
        id: "cool-dark-quiet",
        icon: BedDouble,
        title: "Cool, dark, quiet",
        description: "A cool, dark room helps you fall asleep and stay asleep.",
        accent: "#4338ca",
        category: "sleep",
    },
    {
        id: "short-naps",
        icon: Timer,
        title: "Keep naps short",
        description: "Twenty minutes refreshes; an hour leaves you groggy.",
        accent: "#0ea5e9",
        category: "sleep",
    },
    {
        id: "morning-light",
        icon: Sunrise,
        title: "Wake with light",
        description: "Morning daylight sets your body clock for the whole day.",
        accent: "#f59e0b",
        category: "sleep",
    },
    {
        id: "wind-down",
        icon: Sparkles,
        title: "A wind-down ritual",
        description: "Ten quiet minutes before bed—stretch, read, or just breathe.",
        accent: "#8b5cf6",
        category: "sleep",
    },
    {
        id: "light-dinner",
        icon: Utensils,
        title: "Lighten the late meal",
        description: "Finish a big meal a couple of hours before you lie down.",
        accent: "#64748b",
        category: "sleep",
    },
    {
        id: "screens-off",
        icon: MoonStar,
        title: "No screens late",
        description: "Put the phone away an hour before bed and let your mind rest.",
        accent: "#4f46e5",
        category: "sleep",
    },

    // ── Activity ─────────────────────────────────────────────────────────────
    {
        id: "movement",
        icon: Dumbbell,
        title: "Move daily",
        description: "Get 30 minutes of activity — a brisk walk counts.",
        accent: "#dc2626",
        category: "activity",
    },
    {
        id: "sunlight",
        icon: Sun,
        title: "Catch the sun",
        description: "Step outside for a dose of vitamin D each morning.",
        accent: "#06c7ab",
        category: "activity",
    },
    {
        id: "posture",
        icon: Activity,
        title: "Stretch it out",
        description: "Stand and stretch every hour to keep muscles loose.",
        accent: "#0d9488",
        category: "activity",
    },
    {
        id: "walking",
        icon: Footprints,
        title: "Walk more",
        description: "Take the stairs and walk short trips you would normally drive.",
        accent: "#16a34a",
        category: "activity",
    },
    {
        id: "strength",
        icon: BicepsFlexed,
        title: "Strength twice a week",
        description: "Bands, bodyweight or weights keep muscles and bones strong.",
        accent: "#b91c1c",
        category: "activity",
    },
    {
        id: "cycling",
        icon: Bike,
        title: "Cycle when you can",
        description: "A bike turns the daily commute into gentle exercise.",
        accent: "#0284c7",
        category: "activity",
    },
    {
        id: "short-bursts",
        icon: Zap,
        title: "Short bursts count",
        description: "Three brisk ten-minute walks add up to the same thing.",
        accent: "#ea580c",
        category: "activity",
    },
    {
        id: "outdoors",
        icon: Trees,
        title: "Get outdoors",
        description: "Time in a park lifts mood as well as fitness.",
        accent: "#15803d",
        category: "activity",
    },
    {
        id: "heart-rate",
        icon: HeartPulse,
        title: "Raise your heart rate",
        description: "Push hard enough to be a little breathless, once a week.",
        accent: "#e11d48",
        category: "activity",
    },
    {
        id: "standing",
        icon: PersonStanding,
        title: "Stand up every hour",
        description: "Breaking up long sitting matters as much as daily exercise.",
        accent: "#0f766e",
        category: "activity",
    },

    // ── Mind ─────────────────────────────────────────────────────────────────
    {
        id: "mind",
        icon: Brain,
        title: "Protect your mind",
        description: "Take breaks, breathe, and practice a little mindfulness.",
        accent: "#f59e0b",
        category: "mind",
    },
    {
        id: "breathe",
        icon: Wind,
        title: "Just breathe",
        description: "Slow, deep breaths calm the nervous system fast.",
        accent: "#4f46e5",
        category: "mind",
    },
    {
        id: "gratitude",
        icon: HandHeart,
        title: "Practice gratitude",
        description: "Name one good thing each day; it shifts what you notice.",
        accent: "#ec4899",
        category: "mind",
    },
    {
        id: "sit-still",
        icon: Flower2,
        title: "Sit still",
        description: "Five quiet minutes with no task is a real break, not wasted time.",
        accent: "#8b5cf6",
        category: "mind",
    },
    {
        id: "journal",
        icon: BookOpen,
        title: "Journal it",
        description: "Writing worries down gets them out of your head.",
        accent: "#0ea5e9",
        category: "mind",
    },
    {
        id: "connect",
        icon: Smile,
        title: "Connect with people",
        description: "A short call with someone you like is good medicine.",
        accent: "#10b981",
        category: "mind",
    },
    {
        id: "eye-rest",
        icon: Eye,
        title: "Rest your eyes",
        description: "Every 20 minutes, look at something far away for 20 seconds.",
        accent: "#6366f1",
        category: "mind",
    },
    {
        id: "music",
        icon: Music,
        title: "Let music soothe",
        description: "A favorite song can lift a mood faster than a scroll.",
        accent: "#a855f7",
        category: "mind",
    },
    {
        id: "small-wins",
        icon: Sparkles,
        title: "Small wins",
        description: "Notice what you did today, not only what is left to do.",
        accent: "#d946ef",
        category: "mind",
    },
    {
        id: "boundaries",
        icon: Shield,
        title: "Set boundaries",
        description: "Saying no to one thing makes room for what matters.",
        accent: "#475569",
        category: "mind",
    },
];

/** The tips in one category, in the order they appear above. */
export function tipsForCategory(category: TipCategoryId): HealthTip[] {
    return TIPS.filter((tip) => tip.category === category);
}

/** The tip that belongs to `date`, rotating by day of the year. */
export function tipOfTheDay(date = new Date()): HealthTip {
    const start = new Date(date.getFullYear(), 0, 0);
    const dayOfYear = Math.floor(
        (date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );
    return TIPS[dayOfYear % TIPS.length];
}
