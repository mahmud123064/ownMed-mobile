import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import DashboardHeader from "@/components/dashboard/DashboardHeader";
import Drawer from "@/components/dashboard/Drawer";
import { SECTION_COMPONENTS } from "@/components/dashboard/sections";
import type { SectionId } from "@/components/dashboard/types";
import GuestBackupBanner from "@/components/ui/GuestBackupBanner";

const SECTION_IDS: SectionId[] = [
    "overview",
    "profile",
    "add-medicine",
    "medicine-history",
    "family",
    "reports",
];

/** A route `section` param, or "overview" when absent or unrecognized. */
function parseSection(value: unknown): SectionId {
    return typeof value === "string" &&
        (SECTION_IDS as string[]).includes(value)
        ? (value as SectionId)
        : "overview";
}

export default function DashboardScreen() {
    const { section } = useLocalSearchParams<{ section?: string }>();
    const [drawerOpen, setDrawerOpen] = useState(false);

    // The route param *is* the active section, rather than a copy mirrored into
    // state: deep-links from Home / How to use arrive while this tab is already
    // mounted, and a local copy would need an effect to catch up with them.
    // Drawer taps write the param back (`router.setParams`), so there is one
    // source of truth and the URL always names what is on screen.
    const active = parseSection(section);

    const ActiveSection = SECTION_COMPONENTS[active];

    return (
        <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
            <DashboardHeader onMenuPress={() => setDrawerOpen(true)} />
            <GuestBackupBanner />
            <ActiveSection />
            <Drawer
                open={drawerOpen}
                active={active}
                onClose={() => setDrawerOpen(false)}
                onSelect={(id) => {
                    router.setParams({ section: id });
                    setDrawerOpen(false);
                }}
            />
        </SafeAreaView>
    );
}
