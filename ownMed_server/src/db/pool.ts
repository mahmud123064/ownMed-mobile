import { Pool } from "pg";

import { env } from "../config/env.js";

/**
 * Shared connection pool.
 *
 * `pg` connects lazily, so importing this module never blocks startup — the
 * process boots even if Neon is unreachable, and `/health` reports the real
 * connection state instead of the server crashing.
 */
export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  // Fail fast when the database is unreachable so a request (including
  // `/health`) can't hang on a dead host.
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

// Without this listener an error on an idle client is an unhandled 'error'
// event, which takes the whole process down.
pool.on("error", (err) => {
  console.error("[db] unexpected error on idle client:", err.message);
});

export async function closePool(): Promise<void> {
  await pool.end();
}
