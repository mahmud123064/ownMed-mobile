import { describe, expect, it } from "vitest";

import { api, expectApiError } from "./helpers.js";

/**
 * Cross-cutting API behaviour: liveness, public metadata, routing, body
 * parsing and CORS. These are the properties every resource depends on, so
 * they are asserted once here rather than inside a resource suite.
 */

describe("API — liveness and public metadata", () => {
  it("reports liveness and a live database connection", async () => {
    const res = await api().get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      db: "connected",
    });
    expect(typeof res.body.uptime).toBe("number");
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
  });

  it("serves the app release info without a session", async () => {
    const res = await api().get("/app/version");

    expect(res.status).toBe(200);
    expect(typeof res.body.latestVersion).toBe("string");
    expect(typeof res.body.storeUrl).toBe("string");
  });
});

describe("API — routing and error shape", () => {
  it("turns an unknown route into the standard 404 body", async () => {
    const res = await api().get("/does-not-exist");
    expectApiError(res, 404, /Route GET \/does-not-exist not found/);
  });

  it("answers every error with { error: { message, statusCode } }", async () => {
    const res = await api().post("/auth/login").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(
      expect.objectContaining({
        message: expect.any(String),
        statusCode: 400,
      }),
    );
    // Never a bare string or an unshaped stack trace.
    expect(typeof res.body.error.message).toBe("string");
  });

  it("serves JSON with the JSON content type", async () => {
    const res = await api().get("/health");
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
  });
});

describe("API — request body handling", () => {
  it("answers malformed JSON with 400, not 500", async () => {
    const res = await api()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "broken"');

    expectApiError(res, 400, "Invalid JSON body");
  });

  it("enforces the 1 MB body cap with 413", async () => {
    const oversized = JSON.stringify({ blob: "x".repeat(1_100_000) });
    const res = await api()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send(oversized);

    expectApiError(res, 413, "Request body too large");
  });

  it("accepts a body just under the cap", async () => {
    // Valid JSON, still a 400 on validation — but parsed rather than rejected.
    const payload = JSON.stringify({
      email: "someone@ownmed.test",
      password: "x".repeat(700_000),
    });
    const res = await api()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send(payload);

    expect(res.status).not.toBe(413);
  });
});

describe("API — CORS", () => {
  it("reflects a browser origin outside production", async () => {
    const res = await api()
      .get("/app/version")
      .set("Origin", "https://web.ownmed.test");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://web.ownmed.test",
    );
  });

  it("answers a preflight request", async () => {
    const res = await api()
      .options("/auth/login")
      .set("Origin", "https://web.ownmed.test")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,authorization");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-methods"]).toMatch(/POST/);
    expect(res.headers["access-control-allow-headers"]).toMatch(/authorization/i);
  });
});
