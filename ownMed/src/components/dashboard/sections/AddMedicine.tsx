import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
    BriefcaseMedical,
    Check,
    ImagePlus,
    PencilLine,
    Pill,
    Plus,
    Stethoscope,
    Tablets,
    Utensils,
} from "lucide-react-native";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import DateField from "@/components/ui/DateField";
import FormField from "@/components/ui/FormField";
import { useAppData } from "@/context/AppDataContext";
import {
    ALL_DAYS,
    MEAL_TIMINGS,
    TIME_PRESETS,
    WEEK_DAYS,
    daysLabel,
    frequencyLabel,
    isValidDateString,
    parseISODate,
    parseTime,
    sortDays,
    sortTimes,
    todayISO,
} from "@/lib/medicineSchedule";
import { brand, status, useAppTheme } from "@/theme";

import MedicineScheduleTable from "./MedicineScheduleTable";
import MedicineWeekTable from "./MedicineWeekTable";
import UploadPrescription from "./UploadPrescription";

import type { MealTiming } from "../types";

type MedicineForm = {
    name: string;
    dosage: string;
    doctorName: string;
    specialty: string;
};

/** The two ways a medicine gets into the list. */
type Mode = "manual" | "upload";

const MODES: { id: Mode; label: string; icon: typeof Pill }[] = [
    { id: "manual", label: "Add manually", icon: PencilLine },
    { id: "upload", label: "Upload prescription", icon: ImagePlus },
];

export default function AddMedicine() {
    const { colors } = useAppTheme();
    // Medicines live in app state (and on disk) so a guest's additions survive
    // a restart and can be synced to their account later.
    const { medicines, addMedicine } = useAppData();

    // Both modes write to the same `medicines` list, so switching between them
    // is just a change of input method — the manual form keeps whatever was
    // typed into it while the user goes to check their prescription photo.
    const [mode, setMode] = useState<Mode>("manual");

    // Times, days and the dates are held outside react-hook-form: they are
    // built by tapping chips and calendars rather than by a single field value.
    // Frequency is never stored — it is `times.length`.
    const [times, setTimes] = useState<string[]>([]);
    const [customTime, setCustomTime] = useState("");
    const [timeError, setTimeError] = useState<string | null>(null);
    const [days, setDays] = useState<number[]>(ALL_DAYS);
    const [startedOn, setStartedOn] = useState(todayISO());
    // "" means the course is ongoing, which is the usual case.
    const [endedOn, setEndedOn] = useState("");
    // "" is "not recorded", which is a real answer — a medicine with no meal
    // relation is common, so this is never required.
    const [mealTiming, setMealTiming] = useState<MealTiming>("");

    const form = useForm<MedicineForm>({
        defaultValues: { name: "", dosage: "", doctorName: "", specialty: "" },
    });

    // The start date comes from a calendar, so it is always a real date; the end
    // date can only be wrong by being before the start, which the picker's own
    // `minimumDate` prevents but a stale value could still slip past. Validity
    // is checked first so a malformed date isn't reported as an ordering problem.
    const endDateError =
        endedOn === ""
            ? null
            : !isValidDateString(endedOn)
              ? "That end date isn't valid."
              : endedOn < startedOn
                ? "End date can't be before the start date."
                : null;

    // Only hand the picker a bound we know is real — an Invalid Date would
    // reach the native view and behave unpredictably.
    const earliestEnd = isValidDateString(startedOn)
        ? parseISODate(startedOn)
        : undefined;

    /** Every time switched on that isn't one of the presets. */
    const customTimes = times.filter(
        (time) => !TIME_PRESETS.some((preset) => preset.time === time),
    );

    const toggleTime = (time: string) => {
        setTimeError(null);
        setTimes((current) =>
            current.includes(time)
                ? current.filter((t) => t !== time)
                : sortTimes([...current, time]),
        );
    };

    const addCustomTime = () => {
        const parsed = parseTime(customTime);
        if (!parsed) {
            setTimeError("Enter a time like 13:00 or 8pm.");
            return;
        }
        setTimes((current) => sortTimes([...current, parsed]));
        setCustomTime("");
        setTimeError(null);
    };

    const toggleDay = (value: number) => {
        setDays((current) =>
            current.includes(value)
                ? current.filter((day) => day !== value)
                : sortDays([...current, value]),
        );
    };

    const onAdd = (data: MedicineForm) => {
        if (times.length === 0) {
            setTimeError("Switch on at least one reminder time.");
            return;
        }
        if (days.length === 0) return;
        if (!isValidDateString(startedOn)) return;
        if (endDateError) return;

        addMedicine({
            name: data.name,
            dosage: data.dosage,
            times,
            days,
            startedOn,
            endedOn,
            // Blank is a real answer — an over-the-counter medicine has no
            // prescriber — so these are stored as typed, just trimmed.
            doctorName: data.doctorName.trim(),
            specialty: data.specialty.trim(),
            mealTiming,
        });
        form.reset();
        setTimes([]);
        setCustomTime("");
        setTimeError(null);
        setDays(ALL_DAYS);
        setStartedOn(todayISO());
        setEndedOn("");
        setMealTiming("");
    };

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            className="flex-1"
        >
            <View className="px-6 pt-6">
                <Text className="text-2xl font-display-bold text-foreground">
                    Add Medicine
                </Text>
                <Text className="mt-1 text-sm font-sans text-muted">
                    {mode === "manual"
                        ? "Add medicine details and switch on the times you take it."
                        : "Add a photo and let the app read the medicines off it."}
                </Text>

                {/* Two ways in, one list out. Upload is not a separate screen
                    because it is not a separate feature — it is the other way
                    to do this same job. */}
                <View className="mt-5 flex-row gap-1 rounded-2xl border border-border bg-surface p-1">
                    {MODES.map(({ id, label, icon: Icon }) => {
                        const active = mode === id;
                        return (
                            <Pressable
                                key={id}
                                onPress={() => setMode(id)}
                                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${
                                    active ? "bg-brand-600" : ""
                                }`}
                            >
                                <Icon
                                    color={active ? "#ffffff" : colors.muted}
                                    size={15}
                                    strokeWidth={2}
                                />
                                <Text
                                    className={`text-sm ${
                                        active
                                            ? "font-semibold text-white"
                                            : "font-sans text-muted"
                                    }`}
                                >
                                    {label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {mode === "upload" ? (
                    <UploadPrescription onAddManually={() => setMode("manual")} />
                ) : (
                    <>
                        <View className="mt-5 gap-4">
                            <Controller
                                control={form.control}
                                name="name"
                                rules={{ required: "Medicine name is required." }}
                                render={({ field: { onChange, onBlur, value } }) => (
                                    <FormField
                                        label="Medicine name"
                                        icon={Pill}
                                        error={form.formState.errors.name?.message}
                                        value={value}
                                        onChangeText={onChange}
                                        onBlur={onBlur}
                                        placeholder="e.g. Napa"
                                        autoCapitalize="words"
                                    />
                                )}
                            />

                            <Controller
                                control={form.control}
                                name="dosage"
                                rules={{ required: "Dosage is required." }}
                                render={({ field: { onChange, onBlur, value } }) => (
                                    <FormField
                                        label="Dosage"
                                        icon={Tablets}
                                        error={form.formState.errors.dosage?.message}
                                        value={value}
                                        onChangeText={onChange}
                                        onBlur={onBlur}
                                        placeholder="e.g. 500mg"
                                    />
                                )}
                            />

                            {/* When to take it, relative to food. Optional like the
                                prescriber below: plenty of medicines have no meal
                                relation at all, so a blank is a real answer rather
                                than a gap. Tapping the selected chip clears it, so
                                a mis-tap is undoable. */}
                            <View className="gap-2">
                                <View className="flex-row items-center gap-1.5">
                                    <Utensils
                                        color={colors.muted}
                                        size={14}
                                        strokeWidth={2}
                                    />
                                    <Text className="text-sm font-medium text-foreground">
                                        When to take (optional)
                                    </Text>
                                </View>
                                <View className="flex-row flex-wrap gap-2">
                                    {MEAL_TIMINGS.map((option) => {
                                        const active =
                                            mealTiming === option.value;
                                        return (
                                            <Pressable
                                                key={option.value}
                                                onPress={() =>
                                                    setMealTiming(
                                                        active
                                                            ? ""
                                                            : option.value,
                                                    )
                                                }
                                                className={`flex-row items-center gap-1.5 rounded-2xl border px-3 py-2 ${
                                                    active
                                                        ? "border-brand-600 bg-brand-600/10"
                                                        : "border-border bg-surface"
                                                }`}
                                            >
                                                {active ? (
                                                    <Check
                                                        color={brand[600]}
                                                        size={14}
                                                        strokeWidth={3}
                                                    />
                                                ) : null}
                                                <Text
                                                    className={`text-sm ${
                                                        active
                                                            ? "font-semibold text-brand-700"
                                                            : "font-sans text-muted"
                                                    }`}
                                                >
                                                    {option.label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* Who prescribed it. Optional throughout: plenty of
                                medicines are bought over the counter, and a required
                                doctor would make those impossible to record. */}
                            <Controller
                                control={form.control}
                                name="doctorName"
                                render={({ field: { onChange, onBlur, value } }) => (
                                    <FormField
                                        label="Doctor name (optional)"
                                        icon={Stethoscope}
                                        value={value}
                                        onChangeText={onChange}
                                        onBlur={onBlur}
                                        placeholder="e.g. Dr. Rahman"
                                        autoCapitalize="words"
                                    />
                                )}
                            />

                            <Controller
                                control={form.control}
                                name="specialty"
                                render={({ field: { onChange, onBlur, value } }) => (
                                    <FormField
                                        label="Specialty (optional)"
                                        icon={BriefcaseMedical}
                                        value={value}
                                        onChangeText={onChange}
                                        onBlur={onBlur}
                                        placeholder="e.g. Cardiology"
                                        autoCapitalize="words"
                                    />
                                )}
                            />

                            {/* Reminder times — the frequency, chosen as on/off slots. */}
                            <View className="gap-2">
                                <View className="flex-row items-baseline justify-between">
                                    <Text className="text-sm font-medium text-foreground">
                                        Reminder times
                                    </Text>
                                    <Text className="text-xs font-sans text-muted">
                                        {times.length === 0
                                            ? "None selected"
                                            : frequencyLabel(times.length)}
                                    </Text>
                                </View>

                                <View className="flex-row flex-wrap gap-2 pt-1">
                                    {/* Presets are always offered; any other time the
                                        user added joins them as a chip of its own. */}
                                    {[
                                        ...TIME_PRESETS,
                                        ...customTimes.map((time) => ({
                                            key: time,
                                            label: "",
                                            time,
                                        })),
                                    ].map(({ key, label, time }) => {
                                        const active = times.includes(time);
                                        return (
                                            <Pressable
                                                key={key}
                                                onPress={() => toggleTime(time)}
                                                className={`flex-row items-center gap-1.5 rounded-2xl border px-3 py-2 ${
                                                    active
                                                        ? "border-brand-600 bg-brand-600/10"
                                                        : "border-border bg-surface"
                                                }`}
                                            >
                                                {active ? (
                                                    <Check
                                                        color={brand[600]}
                                                        size={14}
                                                        strokeWidth={3}
                                                    />
                                                ) : null}
                                                {label ? (
                                                    <Text
                                                        className={`text-sm ${
                                                            active
                                                                ? "font-semibold text-brand-700"
                                                                : "font-sans text-muted"
                                                        }`}
                                                    >
                                                        {label}
                                                    </Text>
                                                ) : null}
                                                <Text
                                                    className={`text-sm ${
                                                        active
                                                            ? "font-semibold text-brand-700"
                                                            : "font-sans text-muted"
                                                    }`}
                                                >
                                                    {time}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                {/* Any time outside the presets, e.g. 13:00. */}
                                <View className="mt-1 flex-row items-center gap-2">
                                    <TextInput
                                        value={customTime}
                                        onChangeText={(value) => {
                                            setCustomTime(value);
                                            setTimeError(null);
                                        }}
                                        onSubmitEditing={addCustomTime}
                                        placeholder="Other time, e.g. 13:00"
                                        placeholderTextColor={colors.muted}
                                        returnKeyType="done"
                                        className="flex-1 rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground"
                                    />
                                    <Pressable
                                        onPress={addCustomTime}
                                        className="rounded-2xl border border-brand-600 px-5 py-3"
                                    >
                                        <Text className="text-sm font-semibold text-brand-700">
                                            Add
                                        </Text>
                                    </Pressable>
                                </View>

                                {timeError ? (
                                    <Text
                                        style={{ color: status.danger }}
                                        className="font-sans text-xs"
                                    >
                                        {timeError}
                                    </Text>
                                ) : null}
                            </View>

                            {/* Which days of the week — the second axis of the schedule. */}
                            <View className="gap-2">
                                <View className="flex-row items-baseline justify-between">
                                    <Text className="text-sm font-medium text-foreground">
                                        Days
                                    </Text>
                                    <Text className="text-xs font-sans text-muted">
                                        {days.length === 0
                                            ? "No days selected"
                                            : daysLabel(days.length)}
                                    </Text>
                                </View>

                                <View className="flex-row flex-wrap gap-2 pt-1">
                                    {WEEK_DAYS.map((day) => {
                                        const active = days.includes(day.value);
                                        return (
                                            <Pressable
                                                key={day.value}
                                                onPress={() => toggleDay(day.value)}
                                                className={`min-w-[52px] items-center rounded-2xl border px-3 py-2 ${
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
                                                    {day.short}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                {days.length === 0 ? (
                                    <Text
                                        style={{ color: status.danger }}
                                        className="font-sans text-xs"
                                    >
                                        Switch on at least one day.
                                    </Text>
                                ) : null}
                            </View>

                            {/* When the course runs. Both are calendar pickers — a date
                                is far easier to choose than to type on a phone. */}
                            <DateField
                                label="Started on"
                                value={startedOn}
                                onChange={setStartedOn}
                            />

                            <DateField
                                label="End date"
                                value={endedOn}
                                onChange={setEndedOn}
                                placeholder="Ongoing"
                                clearable
                                minimumDate={earliestEnd}
                                error={endDateError ?? undefined}
                            />

                            <Pressable
                                onPress={form.handleSubmit(onAdd)}
                                className="flex-row items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4"
                            >
                                <Plus color="#ffffff" size={18} strokeWidth={2.5} />
                                <Text className="text-base font-semibold text-white">
                                    Add medicine
                                </Text>
                            </Pressable>
                        </View>

                        <View className="mt-8 flex-row items-baseline justify-between">
                            <Text className="text-lg font-semibold text-foreground">
                                Weekly pattern
                            </Text>
                            {medicines.length > 0 ? (
                                <Text className="text-xs font-sans text-muted">
                                    Days each medicine is taken
                                </Text>
                            ) : null}
                        </View>
                        <MedicineWeekTable medicines={medicines} />

                        <View className="mt-8 flex-row items-baseline justify-between">
                            <Text className="text-lg font-semibold text-foreground">
                                Daily schedule
                            </Text>
                            {medicines.length > 0 ? (
                                <Text className="text-xs font-sans text-muted">
                                    {medicines.length}{" "}
                                    {medicines.length === 1 ? "medicine" : "medicines"}
                                </Text>
                            ) : null}
                        </View>
                        <MedicineScheduleTable medicines={medicines} />
                    </>
                )}
            </View>
        </ScrollView>
    );
}
