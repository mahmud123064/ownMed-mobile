import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import DashboardHeader from "@/components/dashboard/DashboardHeader";
import Drawer from "@/components/dashboard/Drawer";
import { SECTION_COMPONENTS } from "@/components/dashboard/sections";
import type { SectionId } from "@/components/dashboard/types";

export default function DashboardScreen() {
    const [active, setActive] = useState<SectionId>("overview");
    const [drawerOpen, setDrawerOpen] = useState(false);

    const ActiveSection = SECTION_COMPONENTS[active];

    return (
        <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
            <DashboardHeader onMenuPress={() => setDrawerOpen(true)} />
            <ActiveSection />
            <Drawer
                open={drawerOpen}
                active={active}
                onClose={() => setDrawerOpen(false)}
                onSelect={(id) => {
                    setActive(id);
                    setDrawerOpen(false);
                }}
            />
        </SafeAreaView>
    );
}
