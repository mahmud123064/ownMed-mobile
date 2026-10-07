import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  familyMembers,
  healthProfiles,
  medicines,
  type FamilyMember,
  type HealthProfile,
  type Medicine,
} from "../db/index.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../utils/validate.js";

export const syncRouter = Router();

/**
 * Guest-to-account sync.
 *
 * A guest accumulates health data on-device; on sign-up (or sign-in) the app
 * pushes the whole local snapshot here. Every id is client-generated, so the
 * upserts are idempotent — pushing the same payload twice must not duplicate
 * rows, and a retry after a flaky network is always safe.
 */

const healthProfileSchema = z.object({
  weightKg: z.string().trim().max(20).optional().default(""),
  heightCm: z.string().trim().max(20).optional().default(""),
  bloodPressureSys: z.string().trim().max(20).optional().default(""),
  bloodPressureDia: z.string().trim().max(20).optional().default(""),
  gender: z.enum(["male", "female", ""]).optional().default(""),
});

// A 24h clock time, e.g. "08:00" or "20:00".
const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid time (expected HH:mm)");

// A calendar date, "YYYY-MM-DD" — a real one, not just a matching shape.
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)")
  // The regex alone accepts 2026-02-30. Round-tripping through Date is the only
  // way to catch a day that doesn't exist in that month: it rolls over instead,
  // so the value no longer matches itself. Done in UTC so the result doesn't
  // depend on the server's timezone.
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Invalid date (no such day)");

/**
 * A calendar date that may also be blank.
 *
 * The client sends `""` — never `null`, never an omitted key — for a date it
 * has none of: an ongoing course, or an unknown start. `.default("")` alone
 * does *not* cover that, since a default only applies when the key is absent;
 * an explicit `""` would fail the regex. Because the payload validates as a
 * whole, one such row would 400 the entire sync. The server also hands `""`
 * back for its own NULL columns, so the client would otherwise be unable to
 * send back a state the server itself produced.
 */
export const optionalCalendarDateSchema = z
  .union([calendarDateSchema, z.literal("")])
  .optional()
  .default("");

export const medicineSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  dosage: z.string().trim().min(1).max(100),
  // Deliberately allows 0 entries. The *client* requires at least one time when
  // adding a medicine, but that is a form rule, not a data invariant: records
  // written before the schedule model existed have none, and the server already
  // returns such rows. Requiring one here would let the server hold a state it
  // refuses to accept back — and since the sync payload is validated as a whole,
  // one schedule-less medicine would fail the entire push.
  times: z.array(clockTimeSchema).max(24),
  // Weekdays taken (0=Sun..6=Sat). Optional-with-default so that a device still
  // running the previous build — which sends neither this nor `startedOn` — can
  // keep syncing; a required field would reject its whole payload.
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .optional()
    .default([0, 1, 2, 3, 4, 5, 6]),
  startedOn: optionalCalendarDateSchema,
  // Optional-with-default for the same reason as `days`: a device on the
  // previous build sends no `endedOn`, and a required field would 400 its whole
  // sync. Blank means the course is ongoing.
  endedOn: optionalCalendarDateSchema,
  // Who prescribed it. Optional-with-default for the same reason as `days`: the
  // app shipped before these fields existed, and blank is a real state anyway —
  // an over-the-counter medicine has no prescriber.
  doctorName: z.string().trim().max(200).optional().default(""),
  specialty: z.string().trim().max(200).optional().default(""),
  // Whether it is taken before or after food. Optional-with-default for the same
  // reason as `days`: the app shipped before this field existed, and blank is a
  // real answer anyway — many medicines have no meal relation at all.
  mealTiming: z.enum(["before", "after", ""]).optional().default(""),
});

export const familyMemberSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  relation: z.string().trim().min(1).max(100),
  age: z.number().int().min(0).max(150).optional(),
  healthStatus: z.string().trim().max(200).optional().default(""),
  status: z.enum(["stable", "attention"]).optional().default("stable"),
});

/**
 * The two domain collections, without the health profile.
 *
 * Shared with the family routes (`routes/family.ts`), which let another account
 * append to this same data by Family ID: they accept and return exactly this
 * shape, so a linked client speaks the same payload as an ordinary sync. The
 * health profile is deliberately *not* part of it — it is the account owner's
 * own medical data and is out of scope for someone managing a family member's
 * medicines.
 */
export const domainWriteSchema = z.object({
  medicines: z.array(medicineSchema).max(500).optional().default([]),
  familyMembers: z.array(familyMemberSchema).max(500).optional().default([]),
});

const syncSchema = domainWriteSchema.extend({
  healthProfile: healthProfileSchema.nullish(),
});

/** Strip the server-only columns the client has no use for. */
function toHealthProfile(row: HealthProfile) {
  return {
    weightKg: row.weightKg ?? "",
    heightCm: row.heightCm ?? "",
    bloodPressureSys: row.bloodPressureSys ?? "",
    bloodPressureDia: row.bloodPressureDia ?? "",
    gender:
      row.gender === "male" || row.gender === "female" ? row.gender : "",
  };
}

function toMedicine(row: Medicine) {
  return {
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    times: [...row.times].sort(),
    days: [...row.days].sort((a, b) => a - b),
    startedOn: row.startedOn ?? "",
    endedOn: row.endedOn ?? "",
    doctorName: row.doctorName ?? "",
    specialty: row.specialty ?? "",
    // Anything that is not one of the two known values reads as "not recorded",
    // so a hand-edited or legacy value can never reach the client as something it
    // would then echo straight back into a rejected payload.
    mealTiming:
      row.mealTiming === "before" || row.mealTiming === "after"
        ? row.mealTiming
        : "",
  };
}

function toFamilyMember(row: FamilyMember) {
  return {
    id: row.id,
    name: row.name,
    relation: row.relation,
    age: row.age ?? 0,
    healthStatus: row.healthStatus ?? "",
    status: row.status === "attention" ? ("attention" as const) : ("stable" as const),
  };
}

/**
 * Medicines and family members as the server holds them, newest first.
 *
 * Shared with `routes/family.ts`, which serves the same collections to a linked
 * account. Kept separate from `snapshot` so the family routes can never leak the
 * health profile by accident.
 */
export async function domainSnapshot(userId: string) {
  const [medicineRows, familyRows] = await Promise.all([
    db
      .select()
      .from(medicines)
      .where(eq(medicines.userId, userId))
      .orderBy(desc(medicines.createdAt)),
    db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.userId, userId))
      .orderBy(desc(familyMembers.createdAt)),
  ]);

  return {
    medicines: medicineRows.map(toMedicine),
    familyMembers: familyRows.map(toFamilyMember),
  };
}

/**
 * Add-only merge of a domain payload into `userId`'s rows.
 *
 * `onConflictDoNothing` is what makes this safe to repeat: ids are
 * client-generated UUIDs, so a retry after a flaky network must not duplicate
 * rows — and an id already owned by *another* user is silently skipped rather
 * than reassigned, which is what keeps a linked account from hijacking records.
 */
export async function mergeDomain(
  userId: string,
  input: { medicines: z.infer<typeof medicineSchema>[]; familyMembers: z.infer<typeof familyMemberSchema>[] },
): Promise<void> {
  if (input.medicines.length > 0) {
    await db
      .insert(medicines)
      .values(
        input.medicines.map((m) => ({
          ...m,
          // An empty date means "unknown" or, for `endedOn`, "ongoing" — both
          // of which are what NULL is for.
          startedOn: m.startedOn || null,
          endedOn: m.endedOn || null,
          // Blank means "no prescriber recorded", which is what NULL is for.
          doctorName: m.doctorName || null,
          specialty: m.specialty || null,
          // Blank means "no meal relation recorded", same as above.
          mealTiming: m.mealTiming || null,
          userId,
        })),
      )
      .onConflictDoNothing();
  }

  if (input.familyMembers.length > 0) {
    await db
      .insert(familyMembers)
      .values(
        input.familyMembers.map((m) => ({
          ...m,
          age: m.age ?? null,
          userId,
        })),
      )
      .onConflictDoNothing();
  }
}

/**
 * The account's current state. Both routes return this, so the client always
 * ends up holding the server's view of the truth after a sync.
 */
async function snapshot(userId: string) {
  const [profileRows, domain] = await Promise.all([
    db
      .select()
      .from(healthProfiles)
      .where(eq(healthProfiles.userId, userId))
      .limit(1),
    domainSnapshot(userId),
  ]);

  const profile = profileRows[0];
  return {
    healthProfile: profile ? toHealthProfile(profile) : null,
    ...domain,
  };
}

syncRouter.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await snapshot(req.user!.id));
  }),
);

syncRouter.post(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const input = validate(syncSchema, req.body);

    // Health profile: only seed it when the account has none. A returning
    // account's real health data must not be clobbered by whatever an
    // anonymous device happened to have in local storage.
    if (input.healthProfile) {
      const existing = await db
        .select({ id: healthProfiles.id })
        .from(healthProfiles)
        .where(eq(healthProfiles.userId, userId))
        .limit(1);

      if (existing.length === 0) {
        await db
          .insert(healthProfiles)
          .values({ userId, ...input.healthProfile })
          .onConflictDoNothing();
      }
    }

    // Medicines and family members: upsert-by-id, never delete and never
    // overwrite (see `mergeDomain`).
    await mergeDomain(userId, input);

    // Return the merged state so the client can simply adopt it.
    res.json(await snapshot(userId));
  }),
);
