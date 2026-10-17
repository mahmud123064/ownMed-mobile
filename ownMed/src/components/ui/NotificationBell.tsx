import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react-native";
import {
    Alert,
    Dimensions,
    Linking,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppData } from "@/context/AppDataContext";
import { unreadCount } from "@/lib/notices";
import {
    remindersSupported,
    todayDoses,
    type ScheduledDose,
} from "@/lib/notifications";
import { loadMedicines, type AppNotice } from "@/lib/storage";
import { useAppTheme } from "@/theme";

/**
 * The notification bell: a button carrying an unread badge, and the panel it
 * opens — notices first, then today's medicine schedule.
 *
 * A shared widget rather than part of any one header, because three tabs render
 * it (Dashboard, Home, Health Tips) and all three have to agree. The notice list
 * and its read state live in `AppDataContext` for exactly that reason: a copy
 * per screen would let the badge be cleared on one tab and still be standing on
 * another. What stays local here is only the panel itself — whether it is open,
 * and where it is anchored.
 */
export default function NotificationBell() {
    const { colors } = useAppTheme();
    const { hydrated, medicines, notificationsEnabled, notices, markNoticesRead } =
        useAppData();
    const insets = useSafeAreaInsets();

    /**
     * Today's doses, or null before the first read.
     *
     * Null is a distinct state from an empty list on purpose: "not looked yet"
     * and "nothing scheduled" render the same if they are both `[]`, and the
     * panel would claim there is nothing due during the moment it is actually
     * still reading.
     */
    const [doses, setDoses] = useState<ScheduledDose[] | null>(null);
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState({
        top: insets.top + 60,
        right: 16,
    });
    const buttonRef = useRef<View>(null);

    /**
     * Read the schedule on mount, and again whenever the medicines change.
     *
     * On mount rather than only on open, so the panel is already populated when
     * it opens — reading on the tap would put "Reading your schedule…" in front
     * of a user who has just asked a question this device can already answer.
     *
     * From **storage** rather than the `medicines` in context, and that is the
     * point: while a family member is linked the on-screen list is *theirs*, but
     * reminders are scheduled from this device's own list, so listing the linked
     * member's medicines here would promise a ring that never comes. The
     * `medicines` in the dependencies is what re-runs the read after an add, a
     * sign-in or a family link — the storage has been written by then either way.
     *
     * Deliberately not keyed on `notificationsEnabled`: this is a record of what
     * the day holds, not of what will ring, so switching reminders off leaves the
     * list where it already was.
     */
    useEffect(() => {
        if (!hydrated) return;
        let cancelled = false;

        void loadMedicines()
            .then((own) => {
                if (!cancelled) setDoses(todayDoses(own));
            })
            .catch(() => {
                // Unreadable storage reads as "nothing to show" rather than
                // leaving a spinner up forever behind a dismissable panel.
                if (!cancelled) setDoses([]);
            });

        return () => {
            cancelled = true;
        };
    }, [hydrated, medicines]);

    /**
     * Open the panel under the button, and mark what it contains as read.
     *
     * Marking read here, in the handler, rather than in an effect watching
     * `open`: this is one event causing one state change, which is what a handler
     * is for, and an effect would re-run on its own state update and need a guard
     * to settle. It also keeps the "opening the panel is reading it" rule in one
     * obvious place — the badge clears on every screen at once because
     * `markNoticesRead` writes to the shared list.
     */
    const openPanel = () => {
        buttonRef.current?.measureInWindow((x, y, width, height) => {
            const windowWidth = Dimensions.get("window").width;
            setAnchor({
                top: y + height + 8,
                right: windowWidth - (x + width),
            });
            setOpen(true);
        });

        markNoticesRead();
    };

    /** Open a notice's link, where it has one. */
    const openNotice = async (notice: AppNotice) => {
        if (notice.storeUrl === "") return;
        setOpen(false);
        try {
            await Linking.openURL(notice.storeUrl);
        } catch {
            // No browser or store app to hand this to. Showing the URL beats an
            // unhandled rejection, and the user can still reach it by hand.
            Alert.alert("Could not open the link", notice.storeUrl);
        }
    };

    /**
     * What the badge shows: notices the user has not looked at.
     *
     * Notices only — the day's doses are listed in the panel below, but they do
     * not drive the badge. A dose count would be a number fixed from midnight
     * that never falls, so on a busy day it could not be cleared by any action
     * the user took, which is the one thing a badge exists to allow. Unread
     * notices can reach zero, and do the moment the panel opens.
     *
     * Zero while `notices` is still null, so the badge is simply absent until
     * there is a real count behind it.
     */
    const unread = notices === null ? 0 : unreadCount(notices);

    /**
     * The one line under the list, when there is something to say about whether
     * any of it will actually ring.
     *
     * A schedule is still worth showing when reminders cannot fire — it is what
     * the day holds either way — but showing it silently would let the user
     * conclude the reminders are broken.
     */
    const reminderNote = !remindersSupported()
        ? "Reminders need a development build on Android."
        : !notificationsEnabled
          ? "Reminders are off. Turn them on in Settings."
          : "";

    return (
        <>
            <Pressable
                ref={buttonRef}
                onPress={openPanel}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                    unread > 0
                        ? `Notifications, ${unread} unread`
                        : "Notifications"
                }
                className="relative h-10 w-10 items-center justify-center rounded-full border border-border bg-surface"
            >
                <Bell color={colors.foreground} size={20} strokeWidth={2} />

                {/* How much is here that the user has not read. Hidden at zero —
                    rather than shown as "0" — because a badge reading zero is a
                    number the user has to read and dismiss, where an absent one
                    is already the whole answer. `min-w-5` keeps a single digit
                    round and lets two digits widen it. */}
                {unread > 0 ? (
                    <View className="absolute -right-1 -top-1 h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1">
                        <Text className="text-[10px] font-semibold leading-none text-white">
                            {unread}
                        </Text>
                    </View>
                ) : null}
            </Pressable>

            {/* What the bell opens: notices at the top, then today's schedule.

                The two are different kinds of thing and the order says so. A
                notice is news the user has not seen — it is why the badge was
                there, and it should be the first thing the panel answers with.
                The schedule below is not news but a standing answer to "what does
                today hold", which is the same at every opening.

                That schedule is a *schedule*, not a history of delivered
                notifications: the OS keeps no readable record of those once the
                app has been killed, whereas the schedule is the same answer every
                time it is asked. */}
            <Modal
                transparent
                visible={open}
                animationType="fade"
                onRequestClose={() => setOpen(false)}
            >
                <View className="flex-1">
                    <Pressable
                        className="absolute inset-0"
                        onPress={() => setOpen(false)}
                    />
                    <View
                        className="absolute"
                        style={{ top: anchor.top, right: anchor.right }}
                    >
                        <View className="w-72 overflow-hidden rounded-2xl border border-border bg-surface">
                            {/* Notices. Read state is not shown here — the badge
                                is what distinguishes read from unread, and once
                                this panel is open everything in it counts as
                                read, so a dot per row would be a distinction with
                                nothing on the other side of it. */}
                            {notices !== null && notices.length > 0 ? (
                                <>
                                    {notices.map((notice) => (
                                        <Pressable
                                            key={notice.id}
                                            onPress={() =>
                                                void openNotice(notice)
                                            }
                                            disabled={notice.storeUrl === ""}
                                            className="px-4 py-3"
                                        >
                                            <Text className="text-sm font-semibold text-foreground">
                                                {notice.title}
                                            </Text>
                                            <Text className="mt-0.5 text-xs font-sans text-muted">
                                                {notice.body}
                                            </Text>
                                            {/* Only when there is somewhere to
                                                go: a store listing may not exist
                                                yet, and the notice is still worth
                                                reading then. The row keeps its
                                                padding and drops only the
                                                invitation, so it reads as
                                                information rather than as a
                                                button that does nothing. */}
                                            {notice.storeUrl !== "" ? (
                                                <Text className="mt-1 text-xs font-semibold text-brand-600">
                                                    Open the store
                                                </Text>
                                            ) : null}
                                        </Pressable>
                                    ))}
                                    <View className="h-px bg-border" />
                                </>
                            ) : null}

                            <View className="px-4 py-3">
                                <Text className="text-sm font-semibold text-foreground">
                                    Today&apos;s medicines
                                </Text>
                                <Text className="mt-0.5 text-xs font-sans text-muted">
                                    {doses === null
                                        ? "Reading your schedule…"
                                        : doses.length === 0
                                          ? "Nothing scheduled for today."
                                          : `${doses.length} ${doses.length === 1 ? "dose" : "doses"} today`}
                                </Text>
                            </View>

                            {doses !== null && doses.length > 0 ? (
                                <>
                                    <View className="h-px bg-border" />
                                    <ScrollView
                                        className="max-h-80"
                                        showsVerticalScrollIndicator={false}
                                    >
                                        {doses.map((dose, index) => (
                                            <View
                                                key={`${dose.medicine.id}:${dose.time}`}
                                                className={[
                                                    "flex-row items-center gap-3 px-4 py-3",
                                                    index < doses.length - 1 &&
                                                        "border-b border-border",
                                                ].join(" ")}
                                            >
                                                <Text className="text-sm font-semibold text-brand-600">
                                                    {dose.time}
                                                </Text>
                                                <View className="flex-1">
                                                    <Text
                                                        numberOfLines={1}
                                                        className="text-sm font-semibold text-foreground"
                                                    >
                                                        {dose.medicine.name.trim() !==
                                                        ""
                                                            ? dose.medicine.name
                                                            : "Medicine"}
                                                    </Text>
                                                    {dose.medicine.dosage.trim() !==
                                                    "" ? (
                                                        <Text
                                                            numberOfLines={1}
                                                            className="mt-0.5 text-xs font-sans text-muted"
                                                        >
                                                            {
                                                                dose.medicine
                                                                    .dosage
                                                            }
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            </View>
                                        ))}
                                    </ScrollView>
                                </>
                            ) : null}

                            {/* The bell keeps showing what the schedule says even
                                when nothing will ring, since that is still what
                                the day holds — but silently, so the reason
                                belongs on screen next to it. */}
                            {reminderNote !== "" ? (
                                <>
                                    <View className="h-px bg-border" />
                                    <Text className="px-4 py-3 text-xs font-sans text-muted">
                                        {reminderNote}
                                    </Text>
                                </>
                            ) : null}
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}
