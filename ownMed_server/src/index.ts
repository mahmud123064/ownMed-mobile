import { app } from "./app.js";
import { env } from "./config/env.js";
import { closePool } from "./db/pool.js";

const server = app.listen(env.port, () => {
  console.log(
    `[server] OwnMed API listening on http://localhost:${env.port} (${env.nodeEnv})`,
  );
});

function shutdown(signal: string): void {
  console.log(`[server] ${signal} received — shutting down`);
  server.close(() => {
    void closePool()
      .catch((err: unknown) =>
        console.error("[server] error closing pool:", err),
      )
      .finally(() => {
        console.log("[server] shutdown complete");
        process.exit(0);
      });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
