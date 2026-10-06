import { drizzle } from "drizzle-orm/node-postgres";

import { pool } from "./pool.js";
import * as schema from "./schema.js";

/** Shared Drizzle client over the existing `pg` Pool. */
export const db = drizzle(pool, { schema });

export { pool, schema };
export * from "./schema.js";
