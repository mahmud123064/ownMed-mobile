import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { pool } from "../src/db/pool.js";
import { api, createUserDirect, uniqueEmail } from "./helpers.js";

/**
 * Database-level guarantees: what the schema itself enforces (cascades,
 * uniqueness, defaults) and what the serializers make of rows written outside
 * the API. These matter because the routes are not the only writer — migrations,
 * backfills and hand edits all land here, and the read path has to survive them.
 */

async function expectUniqueViolation(
  query: string,
  params: unknown[],
): Promise<void> {
  await expect(pool.query(query, params)).rejects.toMatchObject({
    code: "23505",
  });
}

describe("database — cascading account deletion", () => {
  it("removes every child row when the user is deleted", async () => {
    const user = await createUserDirect();
    const medicineId = randomUUID();
    const familyId = randomUUID();
    const reportId = randomUUID();

    await pool.query(
      "insert into health_profiles (user_id, weight_kg) values ($1, '70')",
      [user.id],
    );
    await pool.query(
      `insert into medicines (id, user_id, name, dosage)
       values ($1, $2, 'Napa', '500mg')`,
      [medicineId, user.id],
    );
    await pool.query(
      `insert into family_members (id, user_id, name, relation)
       values ($1, $2, 'Salma', 'Mother')`,
      [familyId, user.id],
    );
    await pool.query(
      `insert into reports
         (id, user_id, title, category, storage_key, mime_type, size_bytes)
       values ($1, $2, 'Blood test', 'lab', $3, 'application/pdf', 1024)`,
      [reportId, user.id, `reports/${user.id}/${reportId}-test.pdf`],
    );
    await pool.query(
      `insert into refresh_tokens (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '1 day')`,
      [user.id, "cascade-token-hash"],
    );
    await pool.query(
      `insert into password_reset_tokens (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '15 minutes')`,
      [user.id, "cascade-reset-hash"],
    );

    await pool.query("delete from users where id = $1", [user.id]);

    for (const table of [
      "health_profiles",
      "medicines",
      "family_members",
      "reports",
      "refresh_tokens",
      "password_reset_tokens",
    ]) {
      const { rows } = await pool.query(
        `select 1 from ${table} where user_id = $1`,
        [user.id],
      );
      expect(rows, `${table} should be empty`).toHaveLength(0);
    }
  });
});

describe("database — column defaults", () => {
  it("defaults a medicine to no times and every day", async () => {
    const user = await createUserDirect();
    const id = randomUUID();

    const { rows } = await pool.query<{ times: string[]; days: number[] }>(
      `insert into medicines (id, user_id, name, dosage)
       values ($1, $2, 'Napa', '500mg')
       returning times, days`,
      [id, user.id],
    );

    expect(rows[0]!.times).toEqual([]);
    expect(rows[0]!.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("stamps created_at and updated_at on a new user", async () => {
    const user = await createUserDirect();
    const { rows } = await pool.query<{
      created_at: Date;
      updated_at: Date;
    }>("select created_at, updated_at from users where id = $1", [user.id]);

    expect(rows[0]!.created_at).toBeInstanceOf(Date);
    expect(rows[0]!.updated_at).toBeInstanceOf(Date);
  });
});

describe("database — unique constraints", () => {
  it("rejects a duplicate email", async () => {
    const user = await createUserDirect();

    await expectUniqueViolation(
      "insert into users (name, email, password_hash) values ('Another', $1, 'x')",
      [user.email],
    );
  });

  it("rejects a duplicate Family ID", async () => {
    const user = await createUserDirect();

    await expectUniqueViolation(
      `insert into users (name, email, share_id)
       values ('Another', $1, $2)`,
      [uniqueEmail(), user.shareId],
    );
  });

  it("rejects a second health profile for the same user", async () => {
    const user = await createUserDirect();
    await pool.query(
      "insert into health_profiles (user_id, weight_kg) values ($1, '70')",
      [user.id],
    );

    await expectUniqueViolation(
      "insert into health_profiles (user_id, weight_kg) values ($1, '80')",
      [user.id],
    );
  });

  it("rejects a duplicate refresh-token hash", async () => {
    const user = await createUserDirect();
    await pool.query(
      `insert into refresh_tokens (user_id, token_hash, expires_at)
       values ($1, 'same-hash', now() + interval '1 day')`,
      [user.id],
    );

    await expectUniqueViolation(
      `insert into refresh_tokens (user_id, token_hash, expires_at)
       values ($1, 'same-hash', now() + interval '1 day')`,
      [user.id],
    );
  });

  it("rejects a duplicate client-generated medicine id", async () => {
    const first = await createUserDirect();
    const second = await createUserDirect();
    const id = randomUUID();

    await pool.query(
      "insert into medicines (id, user_id, name, dosage) values ($1, $2, 'A', '1')",
      [id, first.id],
    );

    await expectUniqueViolation(
      "insert into medicines (id, user_id, name, dosage) values ($1, $2, 'B', '2')",
      [id, second.id],
    );
  });
});

describe("database — the read path clamps stored values", () => {
  it("flattens NULLs and unknown enum values on a medicine", async () => {
    const user = await createUserDirect();
    const id = randomUUID();

    // A row written by an older build or hand-edited: no dates, no prescriber,
    // and a meal timing the API never issues.
    await pool.query(
      `insert into medicines
         (id, user_id, name, dosage, times, days, meal_timing)
       values ($1, $2, 'Napa', '500mg', '{20:00,08:00}', '{3,1}', 'sometimes')`,
      [id, user.id],
    );

    const res = await api().get("/sync").set("Authorization", user.auth);
    expect(res.status).toBe(200);

    const medicine = res.body.medicines.find(
      (m: { id: string }) => m.id === id,
    );
    expect(medicine).toEqual({
      id,
      name: "Napa",
      dosage: "500mg",
      times: ["08:00", "20:00"],
      days: [1, 3],
      startedOn: "",
      endedOn: "",
      doctorName: "",
      specialty: "",
      mealTiming: "",
    });
  });

  it("flattens NULLs and clamps an unknown health profile", async () => {
    const user = await createUserDirect();
    await pool.query(
      `insert into health_profiles (user_id, blood_group, gender)
       values ($1, 'XYZ', 'robot')`,
      [user.id],
    );

    const res = await api().get("/sync").set("Authorization", user.auth);
    expect(res.body.healthProfile).toEqual({
      weightKg: "",
      heightCm: "",
      bloodGroup: "",
      gender: "",
    });
  });

  it("clamps an unknown report category to 'other'", async () => {
    const user = await createUserDirect();
    const id = randomUUID();

    await pool.query(
      `insert into reports
         (id, user_id, title, category, storage_key, mime_type, size_bytes)
       values ($1, $2, 'Mystery', 'weird', $3, 'application/pdf', 10)`,
      [id, user.id, `reports/${user.id}/${id}-x.pdf`],
    );

    const res = await api().get("/reports").set("Authorization", user.auth);
    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(1);
    expect(res.body.reports[0].category).toBe("other");
    expect(res.body.reports[0].takenOn).toBe("");
    expect(res.body.reports[0].file.thumbnailKey).toBe("");
  });

  it("returns medicines and reports newest first", async () => {
    const user = await createUserDirect();
    const olderMedicine = randomUUID();
    const newerMedicine = randomUUID();
    const olderReport = randomUUID();
    const newerReport = randomUUID();

    await pool.query(
      `insert into medicines (id, user_id, name, dosage, created_at)
       values ($1, $2, 'Older', '1', now() - interval '2 hours'),
              ($3, $2, 'Newer', '2', now() - interval '1 hour')`,
      [olderMedicine, user.id, newerMedicine],
    );
    await pool.query(
      `insert into reports
         (id, user_id, title, category, storage_key, mime_type, size_bytes, created_at)
       values ($1, $2, 'Older', 'lab', $3, 'application/pdf', 1, now() - interval '2 hours'),
              ($4, $2, 'Newer', 'lab', $5, 'application/pdf', 1, now() - interval '1 hour')`,
      [
        olderReport,
        user.id,
        `reports/${user.id}/${olderReport}-a.pdf`,
        newerReport,
        `reports/${user.id}/${newerReport}-b.pdf`,
      ],
    );

    const sync = await api().get("/sync").set("Authorization", user.auth);
    expect(
      sync.body.medicines.map((m: { id: string }) => m.id),
    ).toEqual([newerMedicine, olderMedicine]);

    const reports = await api().get("/reports").set("Authorization", user.auth);
    expect(
      reports.body.reports.map((r: { id: string }) => r.id),
    ).toEqual([newerReport, olderReport]);
  });
});
