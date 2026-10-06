import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config. `generate` only reads the schema; `migrate` connects to
 * Neon via the same DATABASE_URL the app uses.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
