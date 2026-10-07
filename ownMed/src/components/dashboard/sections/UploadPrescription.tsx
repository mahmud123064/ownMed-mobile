import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
    CloudUpload,
    ImagePlus,
    PencilLine,
    Trash2,
    TriangleAlert,
} from "lucide-react-native";
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    Text,
    View,
} from "react-native";

import { parsePrescription } from "@/lib/prescription";
import { status, useAppTheme, brand } from "@/theme";

type Props = {
    /** Leave the uploader and add the medicine by hand instead. */
    onAddManually: () => void;
};

/**
 * The prescription route to adding a medicine — one of the two modes of Add
 * Medicine, which owns the screen and its scrolling. This is deliberately not a
 * `ScrollView` of its own: nesting one inside the parent's is a scroll conflict
 * on Android, and the parent already scrolls.
 */
export default function UploadPrescription({ onAddManually }: Props) {
    const { colors } = useAppTheme();
    const [images, setImages] = useState<string[]>([]);
    const [reading, setReading] = useState(false);

    const pick = async () => {
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                Alert.alert(
                    "Permission needed",
                    "Enable photo library access to upload prescription images.",
                );
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsMultipleSelection: true,
                selectionLimit: 5,
                quality: 0.8,
            });
            if (!result.canceled) {
                setImages((prev) =>
                    [...prev, ...result.assets.map((a) => a.uri)].slice(0, 5),
                );
            }
        } catch {
            Alert.alert("Something went wrong", "Could not open the image picker.");
        }
    };

    /**
     * Automatic reading is not built yet, so this always lands on the same
     * advice. It still goes through `parsePrescription` rather than short-
     * circuiting: when the parser is implemented, this is the call that starts
     * working, and the review step belongs right where the catch is.
     */
    const read = async () => {
        if (images.length === 0) {
            Alert.alert("No images", "Add prescription images first.");
            return;
        }
        setReading(true);
        try {
            await parsePrescription(images);
            // Unreachable until the parser is implemented. Drafts must be shown
            // for review and confirmation before anything is saved.
            onAddManually();
        } catch {
            Alert.alert(
                "Automatic reading isn't available yet",
                "For now, please add each medicine manually — it is the most accurate way, and you can keep this photo as a reference.",
                [{ text: "Add manually", onPress: onAddManually }],
            );
        } finally {
            setReading(false);
        }
    };

    const remove = (uri: string) =>
        setImages((prev) => prev.filter((u) => u !== uri));

    return (
        <View className="mt-5">
            {/* The caution is standing, not a one-off dialog: the user should
                read it while deciding, not only after something went wrong. */}
            <View className="flex-row gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3">
                <TriangleAlert color={status.warning} size={18} strokeWidth={2} />
                <Text className="flex-1 text-xs font-sans text-warning">
                    Automatic reading can misread a prescription — drug names and
                    dosages are easy to confuse. Adding each medicine manually is
                    the most accurate option.
                </Text>
            </View>

            <Pressable
                onPress={pick}
                className="mt-4 items-center justify-center gap-2 rounded-3xl border border-dashed border-border bg-surface px-4 py-8"
            >
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/10">
                    <ImagePlus color={colors.muted} size={24} strokeWidth={2} />
                </View>
                <Text className="text-sm font-semibold text-foreground">
                    Add prescription images
                </Text>
                <Text className="text-xs font-sans text-muted">Up to 5 images</Text>
            </Pressable>

            {images.length > 0 && (
                <View className="mt-5 flex-row flex-wrap gap-3">
                    {images.map((uri) => (
                        <View key={uri} className="relative h-24 w-24">
                            <Image
                                source={{ uri }}
                                className="h-full w-full rounded-2xl border border-border"
                            />
                            <Pressable
                                onPress={() => remove(uri)}
                                hitSlop={6}
                                className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full bg-danger"
                            >
                                <Trash2 color="#ffffff" size={12} strokeWidth={2.5} />
                            </Pressable>
                        </View>
                    ))}
                </View>
            )}

            <Pressable
                onPress={read}
                disabled={reading}
                style={{ opacity: reading ? 0.7 : 1 }}
                className="mt-6 flex-row items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4"
            >
                {reading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                    <CloudUpload color="#ffffff" size={18} strokeWidth={2} />
                )}
                <Text className="text-base font-semibold text-white">
                    Read prescription
                </Text>
            </Pressable>

            <Pressable
                onPress={onAddManually}
                className="mt-3 flex-row items-center justify-center gap-2 rounded-2xl border border-brand-600 py-3.5"
            >
                <PencilLine color={brand[600]} size={18} strokeWidth={2} />
                <Text className="text-sm font-semibold text-brand-700">
                    Add medicines manually
                </Text>
            </Pressable>
        </View>
    );
}
