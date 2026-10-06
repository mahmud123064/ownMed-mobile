import { Link } from "expo-router";
import { ChevronRight, CloudUpload } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useAppData } from "@/context/AppDataContext";
import { brand } from "@/theme";

/**
 * Guest Data Policy prompt.
 *
 * Guest data never leaves the device, so uninstalling the app destroys it. This
 * is the standing reminder to create an account; it renders nothing once the
 * user has one.
 */
export default function GuestBackupBanner() {
    const { authUser } = useAppData();
    if (authUser) return null;

    return (
        <View className="px-6 pt-4">
            <Link href="/sign-up" asChild>
                <Pressable className="flex-row items-center gap-3 rounded-3xl border border-brand-600/30 bg-brand-600/10 px-4 py-3">
                    <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-600/15">
                        <CloudUpload
                            color={brand[600]}
                            size={18}
                            strokeWidth={2}
                        />
                    </View>
                    <Text className="flex-1 text-xs leading-relaxed font-sans text-foreground">
                        Create an account to securely back up your data and
                        access it after reinstalling the app.
                    </Text>
                    <ChevronRight
                        color={brand[600]}
                        size={18}
                        strokeWidth={2}
                    />
                </Pressable>
            </Link>
        </View>
    );
}
