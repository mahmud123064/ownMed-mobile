import { Image, Modal, Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";

export type ReportViewerProps = {
    /**
     * The report to show — anything with a title, so a device-only `LocalReport`
     * can be viewed without inventing a server `storageKey` for it. Null keeps
     * the viewer closed.
     */
    report: { title: string } | null;
    /** A URL for the report's file: signed for a server report, a local
     *  `file://` path for one that has not been uploaded. */
    url: string;
    onClose: () => void;
};

/**
 * A full-screen look at an uploaded report image.
 *
 * Only reached for images: a PDF has no in-app renderer here, so the caller
 * hands it to the system viewer instead. That is also why this shows no
 * document chrome — there is nothing to page through, and the pan/zoom comes
 * from the `Image` itself once it is taller or wider than the screen.
 *
 * The URL is passed in rather than fetched here because it is short-lived: the
 * caller already asked for a fresh one, and a second fetch would only risk the
 * two disagreeing.
 */
export default function ReportViewer({
    report,
    url,
    onClose,
}: ReportViewerProps) {
    return (
        <Modal
            visible={report !== null}
            animationType="fade"
            // Android's hardware back button should close this rather than
            // leave the screen behind it.
            onRequestClose={onClose}
            transparent={false}
        >
            <View className="flex-1 bg-black">
                <View className="flex-row items-center gap-3 px-4 pb-2 pt-12">
                    <Text
                        numberOfLines={1}
                        className="flex-1 text-base font-semibold text-white"
                    >
                        {report?.title ?? ""}
                    </Text>
                    <Pressable
                        onPress={onClose}
                        hitSlop={12}
                        className="h-9 w-9 items-center justify-center rounded-full bg-white/15"
                    >
                        <X color="#ffffff" size={18} strokeWidth={2.5} />
                    </Pressable>
                </View>

                {report && url !== "" ? (
                    <Image
                        source={{ uri: url }}
                        // Contain, not cover: a lab report is read, so cropping
                        // it to fill the screen would hide the part that matters.
                        resizeMode="contain"
                        className="flex-1"
                    />
                ) : null}
            </View>
        </Modal>
    );
}
