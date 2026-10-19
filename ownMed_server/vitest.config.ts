import { defineConfig } from "vitest/config";

/**
 * Integration tests drive the real Express app against a real Postgres, so the
 * suites must not run concurrently: they share one database connection pool and
 * the account rows each file creates are cleaned up only after that file.
 *
 * `setupFiles` runs before the test module, which is what lets it install the
 * environment (`NODE_ENV`, `TRUST_PROXY`, the target database) before
 * `src/config/env.ts` freezes it at import time.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // Files run one at a time, and tests inside a file run one at a time. The
    // database is the shared resource; parallel writers would make ordering
    // assertions flaky and cleanup racy.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    // Larger than `testTimeout` because the setup/teardown hooks retry a cold
    // Neon wake-up: three 10 s connection attempts plus backoff.
    hookTimeout: 90_000,
    // A leaked handle (the pg pool) would otherwise keep the run alive.
    teardownTimeout: 10_000,
  },
});
