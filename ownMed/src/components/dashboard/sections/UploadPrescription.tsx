import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { CloudUpload, ImagePlus, Trash2 } from "lucide-react-native";
import {
    Alert,
    Image,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

import { useAppTheme } from "@/theme";

export default function UploadPrescription() {
    const { colors } = useAppTheme();
    const [images, setImages] = useState<string[]>([]);

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

    const upload = () => {
        if (images.length === 0) {
            Alert.alert("No images", "Add prescription images first.");
            return;
        }
        Alert.alert(
            "Upload complete",
            "Prescription uploaded to Cloudinary (demo).",
        );
    };

    const remove = (uri: string) =>
        setImages((prev) => prev.filter((u) => u !== uri));

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            className="flex-1"
        >
            <View className="px-6 pt-6">
                <Text className="text-2xl font-display-bold text-foreground">
                    Upload Prescription
                </Text>
                <Text className="mt-1 text-sm font-sans text-muted">
                    Upload prescription images. Stored securely on Cloudinary.
                </Text>

                <Pressable
                    onPress={pick}
                    className="mt-6 items-center justify-center gap-2 rounded-3xl border border-dashed border-border bg-surface px-4 py-8"
                >
                    <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/10">
                        <ImagePlus color={colors.muted} size={24} strokeWidth={2} />
                    </View>
                    <Text className="text-sm font-semibold text-foreground">
                        Add prescription images
                    </Text>
                    <Text className="text-xs font-sans text-muted">
                        Up to 5 images
                    </Text>
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
                                    <Trash2
                                        color="#ffffff"
                                        size={12}
                                        strokeWidth={2.5}
                                    />
                                </Pressable>
                            </View>
                        ))}
                    </View>
                )}

                <Pressable
                    onPress={upload}
                    className="mt-6 flex-row items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4"
                >
                    <CloudUpload color="#ffffff" size={18} strokeWidth={2} />
                    <Text className="text-base font-semibold text-white">
                        Upload to Cloudinary
                    </Text>
                </Pressable>
            </View>
        </ScrollView>
    );
}
