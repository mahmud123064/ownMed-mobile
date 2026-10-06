import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Auth tables. `gen_random_uuid()` is built into Postgres 14+ (which Neon
 * provides), so no extension is required for the uuid defaults.
 */

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    // Stored trimmed + lowercased by the auth route, so the unique index is
    // case/whitespace-insensitive in practice.
    email: text("email").notNull(),
    // Nullable: reserved for future password-less sign-in (e.g. Google).
    passwordHash: text("password_hash"),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // sha256 hex of the opaque refresh token — never the token itself.
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("refresh_tokens_token_hash_unique").on(table.tokenHash),
    index("refresh_tokens_user_id_idx").on(table.userId),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // sha256 hex of the 6-digit reset code — never the code itself.
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_token_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_id_idx").on(table.userId),
  ],
);

/**
 * Domain tables — the data a guest accumulates on-device and pushes up on
 * sign-up/sign-in (see `routes/sync.ts`).
 *
 * Ids are **client-generated** UUIDs rather than `gen_random_uuid()` defaults:
 * the device creates the row offline, so the same id must survive the trip to
 * the server. That also makes the sync upserts idempotent — re-pushing the same
 * payload must not duplicate rows.
 *
 * The health-profile columns are `text` to match the app's `HealthProfile`
 * (every field is a string, possibly empty), which avoids empty-string↔null
 * conversion bugs on the way through.
 */

export const healthProfiles = pgTable(
  "health_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // One profile per user, so a unique index rather than a plain one.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weightKg: text("weight_kg"),
    heightCm: text("height_cm"),
    bloodPressureSys: text("blood_pressure_sys"),
    bloodPressureDia: text("blood_pressure_dia"),
    gender: text("gender"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("health_profiles_user_id_unique").on(table.userId)],
);

export const medicines = pgTable(
  "medicines",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dosage: text("dosage").notNull(),
    // The scheduled reminder times, e.g. {"08:00","20:00"}. Frequency is not
    // stored — it is derived on the client as `times.length`, so the two can
    // never disagree.
    times: text("times")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Weekdays the medicine is taken, as `Date.getDay()` values (0=Sun..6=Sat).
    // Defaults to every day, which is what a pre-weekly-pattern row meant.
    days: integer("days")
      .array()
      .notNull()
      .default(sql`'{0,1,2,3,4,5,6}'::integer[]`),
    // "YYYY-MM-DD" as a plain string: it is a calendar date, not an instant, so
    // a timestamp would drag timezone conversion into a value that has none.
    // Nullable because rows written before this column have no start date.
    startedOn: text("started_on"),
    // Same shape as `startedOn`. NULL means the course is ongoing — there is no
    // end date, which is the norm for a chronic medicine, so it is the default
    // rather than a missing value.
    endedOn: text("ended_on"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("medicines_user_id_idx").on(table.userId)],
);

export const familyMembers = pgTable(
  "family_members",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relation: text("relation").notNull(),
    age: integer("age"),
    healthStatus: text("health_status"),
    status: text("status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("family_members_user_id_idx").on(table.userId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type HealthProfile = typeof healthProfiles.$inferSelect;
export type Medicine = typeof medicines.$inferSelect;
export type FamilyMember = typeof familyMembers.$inferSelect;
