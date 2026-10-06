import { Router } from "express";

import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const healthRouter = Router();

/**
 * GET /health
 *
 * Liveness + database reachability. Always 200 when the process is up; the
 * `db` field carries the real connection state so the DB check can't turn a
 * liveness probe into a crash loop.
 */
healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    let db: "connected" | "disconnected" = "disconnected";
    try {
      await pool.query("SELECT 1");
      db = "connected";
    } catch (err) {
      console.error(
        "[health] database check failed:",
        err instanceof Error ? err.message : err,
      );
    }

    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      db,
    });
  }),
);
