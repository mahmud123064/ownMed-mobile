import { Pressable, Text } from "react-native";

/**
 * A selectable pill for "pick one of a few known values" rows.
 *
 * Used by the gender and blood-group rows in both the Profile section and the
 * onboarding modal, which is why it lives here rather than in either of them.
 * Chips rather than a text field because these are facts about the person and
 * not free text: picking is faster than typing on a phone keyboard and cannot
 * produce a value the server will reject.
 *
 * Selection is shown with both a border and a tint rather than a fill, so the
 * row stays readable as a row — eight solid teal pills would read as eight
 * buttons with no indication of which is current.
 */
export default function Chip({
    label,
    active,
    onPress,
}: {
    label: string;
    active: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            className={`rounded-2xl border px-4 py-2 ${
                active
                    ? "border-brand-600 bg-brand-600/10"
                    : "border-border bg-surface"
            }`}
        >
            <Text
                className={`text-sm ${
                    active
                        ? "font-semibold text-brand-700"
                        : "font-sans text-muted"
                }`}
            >
                {label}
            </Text>
        </Pressable>
    );
}
