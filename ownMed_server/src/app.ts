import cors from "cors";
import express from "express";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { authRouter } from "./routes/auth.js";
import { familyRouter } from "./routes/family.js";
import { healthRouter } from "./routes/health.js";
import { syncRouter } from "./routes/sync.js";

export const app = express();

// Rate limiting keys on the client address, which behind a proxy is the
// proxy's until told otherwise. Opt-in — see `env.trustProxy`.
if (env.trustProxy) {
  app.set("trust proxy", 1);
}

/**
 * CORS applies only to browsers. Native clients send no `Origin` header and so
 * are unaffected by this either way — which is why development stays wide open
 * (a dev's web build, Expo Go and a LAN device all need to get through) while
 * production narrows to the configured allowlist. An empty allowlist in
 * production denies cross-origin browser access rather than allowing it.
 */
app.use(cors({ origin: env.isProduction ? env.corsOrigins : true }));
// A sync payload is the largest body this API accepts, and it is a few hundred
// KB at most; the default cap is generous enough to be worth tightening.
app.use(express.json({ limit: "1mb" }));

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/sync", syncRouter);
// Unauthenticated by design: the share code is the credential (see routes/family.ts).
app.use("/family", familyRouter);

// Order matters: unmatched routes become 404s, then every error is shaped by
// the single error handler.
app.use(notFound);
app.use(errorHandler);
