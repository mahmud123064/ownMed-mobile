import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { pool } from "../src/db/pool.js";
import {
  api,
  createUserDirect,
  expectApiError,
  registerUser,
} from "./helpers.js";

/**
 * Guest-to-account sync.
 *
 * A guest accumulates data on the device and pushes the whole snapshot at
 * sign-up/sign-in. The properties that matter are: the push is idempotent, it
 * never deletes or rewrites the account's existing data, the health profile is
 * *seeded* rather than merged, and one malformed row rejects the whole payload
 * (zod validates it as a unit) without writing anything.
 */

type MedicineOverrides = Record<string, unknown>;

function medicine(overrides: MedicineOverrides = {}) {
  return {
    id: randomUUID(),
    name: "Napa",
    dosage: "500mg",
    times: ["08:00", "20:00"],
    days: [0, 1, 2, 3, 4, 5, 6],
    startedOn: "",
    endedOn: "",
    doctorName: "",
    specialty: "",
    mealTiming: "",
    ...overrides,
  };
}

function familyMember(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    name: "Salma",
    relation: "Mother",
    healthStatus: "",
    status: "stable",
    ...overrides,
  };
}

describe("guest synchronization — empty and authentication", () => {
  it("returns an empty snapshot for a new account", async () => {
    const user = await createUserDirect();

    const res = await api().get("/sync").set("Authorization", user.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      healthProfile: null,
      medicines: [],
      familyMembers: [],
    });
  });

  it("requires a session on every sync route", async () => {
    expectApiError(await api().get("/sync"), 401);
    expectApiError(await api().post("/sync").send({}), 401);
    expectApiError(
      await api().put("/sync/health-profile").send({ weightKg: "70" }),
      401,
    );
  });
});

describe("guest synchronization — pushing a guest snapshot", () => {
  it("merges medicines, family members and the health profile", async () => {
    const user = await createUserDirect();
    const medicineId = randomUUID();
    const familyId = randomUUID();

    const res = await api()
      .post("/sync")
      .set("Authorization", user.auth)
      .send({
        healthProfile: {
          weightKg: "70",
          heightCm: "175",
          bloodGroup: "O+",
          gender: "male",
        },
        medicines: [medicine({ id: medicineId })],
        familyMembers: [familyMember({ id: familyId })],
      });

    expect(res.status).toBe(200);
    expect(res.body.healthProfile).toEqual({
      weightKg: "70",
      heightCm: "175",
      bloodGroup: "O+",
      gender: "male",
    });
    expect(res.body.medicines).toHaveLength(1);
    expect(res.body.medicines[0].id).toBe(medicineId);
    expect(res.body.familyMembers).toHaveLength(1);
    expect(res.body.familyMembers[0]).toMatchObject({
      id: familyId,
      name: "Salma",
      relation: "Mother",
      // An absent age is a real state, surfaced as 0.
      age: 0,
      status: "stable",
    });
  });

  it("is idempotent — replaying the same payload duplicates nothing", async () => {
    const user = await createUserDirect();
    const payload = {
      healthProfile: { weightKg: "70", heightCm: "175", gender: "male" },
      medicines: [medicine(), medicine({ name: "Seclo" })],
      familyMembers: [familyMember()],
    };

    const first = await api()
      .post("/sync")
      .set("Authorization", user.auth)
      .send(payload);
    const second = await api()
      .post("/sync")
      .set("Authorization", user.auth)
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.medicines).toHaveLength(2);
    expect(second.body.familyMembers).toHaveLength(1);

    const { rows } = await pool.query<{ count: string }>(
      "select count(*) from medicines where user_id = $1",
      [user.id],
    );
    expect(rows[0]!.count).toBe("2");
  });

  it("seeds the health profile only when the account has none", async () => {
    const user = await createUserDirect();

    await api()
      .post("/sync")
      .set("Authorization", user.auth)
      .send({
        healthProfile: { weightKg: "70", heightCm: "175", gender: "male" },
      });

    // A returning account's real measurements must survive whatever the
    // anonymous device happened to be holding when someone signed in.
    const second = await api()
      .post("/sync")
      .set("Authorization", user.auth)
      .send({
        healthProfile: { weightKg: "99", heightCm: "150", gender: "female" },
      });

    expect(second.body.healthProfile).toEqual({
      weightKg: "70",
      heightCm: "175",
      bloodGroup: "",
      gender: "male",
    });
  });

  it("does not create a profile when the payload omits it", async () => {
    const user = await createUserDirect();

    const res = await api()
      .post("/sync")
      .set("Authorization", user.auth)
      .send({ medicines: [medicine()] });

    expect(res.body.healthProfile).toBeNull();
  });

  it("accepts the previous client build's medicine shape", async () => {
    const user = await createUserDirect();
    const id = randomUUID();

    // The old build sent only these four fields and no health profile keys.
    const res = await api()
      .post("/sync")
      .set("Authorization", user.auth)
      .send({
        medicines: [{ id, name: "Napa", dosage: "500mg", times: [] }],
      });

    expect(res.status).toBe(200);
    expect(res.body.medicines[0]).toMatchObject({
      id,
      times: [],
      days: [0, 1, 2, 3, 4, 5, 6],
      startedOn: "",
      endedOn: "",
      doctorName: "",
      specialty: "",
      mealTiming: "",
    });
  });

  it("ignores the superseded blood-pressure keys instead of failing", async () => {
    const user = await createUserDirect();

    const res = await api()
      .post("/sync")
      .set("Authorization", user.auth)
      .send({
        healthProfile: {
          weightKg: "70",
          heightCm: "175",
          bloodPressureSys: "120",
          bloodPressureDia: "80",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.healthProfile).toEqual({
      weightKg: "70",
      heightCm: "175",
      bloodGroup: "",
      gender: "",
    });
  });

  it("sorts times and days on the way back out", async () => {
    const user = await createUserDirect();
    const id = randomUUID();

    const res = await api()
      .post("/sync")
      .set("Authorization", user.auth)
      .send({
        medicines: [
          medicine({ id, times: ["20:00", "08:00"], days: [6, 2, 4] }),
        ],
      });

    expect(res.body.medicines[0].times).toEqual(["08:00", "20:00"]);
    expect(res.body.medicines[0].days).toEqual([2, 4, 6]);
  });
});

describe("guest synchronization — whole-payload validation", () => {
  it("rejects the entire push when one row is malformed", async () => {
    const user = await createUserDirect();

    const res = await api()
      .post("/sync")
      .set("Authorization", user.auth)
      .send({
        medicines: [
          medicine(),
          medicine({ times: ["25:00"] }),
          medicine(),
        ],
      });

    expectApiError(res, 400, /^medicines\.\d+\.times\.0: Invalid time/);

    // Nothing was written — validation happens before the merge.
    const { rows } = await pool.query(
      "select 1 from medicines where user_id = $1",
      [user.id],
    );
    expect(rows).toHaveLength(0);
  });

  it("rejects impossible calendar dates but accepts blanks", async () => {
    const user = await createUserDirect();

    expectApiError(
      await api()
        .post("/sync")
        .set("Authorization", user.auth)
        .send({ medicines: [medicine({ startedOn: "2026-02-30" })] }),
      400,
    );

    expectApiError(
      await api()
        .post("/sync")
        .set("Authorization", user.auth)
        .send({ medicines: [medicine({ endedOn: "not-a-date" })] }),
      400,
    );

    const blank = await api()
      .post("/sync")
      .set("Authorization", user.auth)
      .send({
        medicines: [medicine({ startedOn: "", endedOn: "" })],
      });
    expect(blank.status).toBe(200);
    expect(blank.body.medicines[0].startedOn).toBe("");
    expect(blank.body.medicines[0].endedOn).toBe("");
  });

  it("rejects an unknown meal timing", async () => {
    const user = await createUserDirect();
    expectApiError(
      await api()
        .post("/sync")
        .set("Authorization", user.auth)
        .send({ medicines: [medicine({ mealTiming: "whenever" })] }),
      400,
    );
  });

  it("rejects an invalid weekday and more than 500 records", async () => {
    const user = await createUserDirect();

    expectApiError(
      await api()
        .post("/sync")
        .set("Authorization", user.auth)
        .send({ medicines: [medicine({ days: [7] })] }),
      400,
    );

    expectApiError(
      await api()
        .post("/sync")
        .set("Authorization", user.auth)
        .send({
          familyMembers: Array.from({ length: 501 }, () => familyMember()),
        }),
      400,
    );
  });

  it("rejects a non-UUID medicine id", async () => {
    const user = await createUserDirect();
    expectApiError(
      await api()
        .post("/sync")
        .set("Authorization", user.auth)
        .send({ medicines: [medicine({ id: "not-a-uuid" })] }),
      400,
    );
  });
});

describe("guest synchronization — health profile writes", () => {
  it("creates the profile on PUT and replaces it afterwards", async () => {
    const user = await createUserDirect();

    const created = await api()
      .put("/sync/health-profile")
      .set("Authorization", user.auth)
      .send({
        weightKg: "70",
        heightCm: "175",
        bloodGroup: "O+",
        gender: "male",
      });
    expect(created.status).toBe(200);
    expect(created.body.healthProfile).toEqual({
      weightKg: "70",
      heightCm: "175",
      bloodGroup: "O+",
      gender: "male",
    });

    // A full replace: omitted fields take their blank default.
    const replaced = await api()
      .put("/sync/health-profile")
      .set("Authorization", user.auth)
      .send({ weightKg: "75" });
    expect(replaced.body.healthProfile).toEqual({
      weightKg: "75",
      heightCm: "",
      bloodGroup: "",
      gender: "",
    });

    const snapshot = await api()
      .get("/sync")
      .set("Authorization", user.auth);
    expect(snapshot.body.healthProfile.weightKg).toBe("75");
  });

  it("rejects an unknown blood group rather than storing it", async () => {
    const user = await createUserDirect();

    expectApiError(
      await api()
        .put("/sync/health-profile")
        .set("Authorization", user.auth)
        .send({ bloodGroup: "Z+" }),
      400,
    );

    const { rows } = await pool.query(
      "select 1 from health_profiles where user_id = $1",
      [user.id],
    );
    expect(rows).toHaveLength(0);
  });

  it("does not expose the profile through the domain snapshot", async () => {
    const user = await createUserDirect();
    await api()
      .put("/sync/health-profile")
      .set("Authorization", user.auth)
      .send({ weightKg: "70" });

    const company = await api()
      .post(`/family/${user.shareId}`)
      .send({ medicines: [] });
    expect(company.status).toBe(200);
    expect(company.body).not.toHaveProperty("healthProfile");
  });
});

describe("guest synchronization — ownership", () => {
  it("skips an id already owned by another account", async () => {
    const owner = await createUserDirect();
    const other = await createUserDirect();
    const id = randomUUID();

    await api()
      .post("/sync")
      .set("Authorization", owner.auth)
      .send({ medicines: [medicine({ id, name: "Owner's" })] });

    // The second account pushes the same id: it is skipped, never reassigned.
    const res = await api()
      .post("/sync")
      .set("Authorization", other.auth)
      .send({ medicines: [medicine({ id, name: "Stolen" })] });

    expect(res.status).toBe(200);
    expect(res.body.medicines).toHaveLength(0);

    const { rows } = await pool.query<{ name: string; user_id: string }>(
      "select name, user_id from medicines where id = $1",
      [id],
    );
    expect(rows).toEqual([{ name: "Owner's", user_id: owner.id }]);
  });

  it("keeps one account's snapshot out of another's", async () => {
    const first = await registerUser();
    const second = await createUserDirect();

    await api()
      .post("/sync")
      .set("Authorization", first.auth)
      .send({ medicines: [medicine({ name: "First only" })] });

    const res = await api().get("/sync").set("Authorization", second.auth);
    expect(res.body.medicines).toHaveLength(0);
    expect(res.body.familyMembers).toHaveLength(0);
    expect(res.body.healthProfile).toBeNull();
  });
});
