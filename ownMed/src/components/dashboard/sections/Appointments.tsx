import { Calendar, Clock, Stethoscope } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";

import { brand, useAppTheme } from "@/theme";

import { APPOINTMENTS } from "../mock";
import type { Appointment } from "../types";

const STATUS_META: Record<
    Appointment["status"],
    { label: string; badge: string; text: string }
> = {
    upcoming: { label: "Upcoming", badge: "bg-info/10", text: "text-info" },
    completed: {
        label: "Completed",
        badge: "bg-success/10",
        text: "text-success",
    },
    cancelled: { label: "Cancelled", badge: "bg-danger/10", text: "text-danger" },
};

function AppointmentRow({ appointment }: { appointment: Appointment }) {
    const { colors } = useAppTheme();
    const meta = STATUS_META[appointment.status];
    return (
        <View className="flex-row items-center gap-3 rounded-3xl border border-border bg-surface p-4">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10">
                <Stethoscope color={brand[600]} size={22} strokeWidth={2} />
            </View>
            <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">
                    {appointment.doctor}
                </Text>
                <Text className="mt-0.5 text-xs font-sans text-muted">
                    {appointment.department}
                </Text>
                <View className="mt-1.5 flex-row items-center gap-3">
                    <View className="flex-row items-center gap-1">
                        <Calendar
                            color={colors.muted}
                            size={12}
                            strokeWidth={2}
                        />
                        <Text className="text-xs font-sans text-muted">
                            {appointment.date}
                        </Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                        <Clock color={colors.muted} size={12} strokeWidth={2} />
                        <Text className="text-xs font-sans text-muted">
                            {appointment.time}
                        </Text>
                    </View>
                </View>
            </View>
            <View
                className={`rounded-full px-3 py-1 ${meta.badge}`}
            >
                <Text className={`text-xs font-semibold ${meta.text}`}>
                    {meta.label}
                </Text>
            </View>
        </View>
    );
}

export default function Appointments() {
    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            className="flex-1"
        >
            <View className="px-6 pt-6">
                <Text className="text-2xl font-display-bold text-foreground">
                    My Appointments
                </Text>
                <Text className="mt-1 text-sm font-sans text-muted">
                    Track upcoming and past appointments.
                </Text>

                <View className="mt-5 gap-3">
                    {APPOINTMENTS.map((appointment) => (
                        <AppointmentRow
                            key={appointment.id}
                            appointment={appointment}
                        />
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
