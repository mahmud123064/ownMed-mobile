import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { appVersionRouter } from "./routes/appVersion.js";
import { authRouter } from "./routes/auth.js";
import { familyRouter } from "./routes/family.js";
import { healthRouter } from "./routes/health.js";
import { reportsRouter } from "./routes/reports.js";
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

/**
 * Security headers, including HSTS. TLS itself is terminated at the deploy
 * proxy; this is the response-header half of the same story, and it is what
 * tells a browser to keep using HTTPS for this host afterwards.
 *
 * CSP is off because there is no HTML here — every response is JSON, and the
 * policy Helmet would send only ever applies to a document. The rest of the
 * defaults (`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
 * `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`) are
 * harmless to native clients, which ignore headers they have no use for.
 */
app.use(helmet({ contentSecurityPolicy: false }));

// A sync payload is the largest body this API accepts, and it is a few hundred
// KB at most; the default cap is generous enough to be worth tightening.
app.use(express.json({ limit: "1mb" }));

app.use("/health", healthRouter);
// Unauthenticated: a device that has not signed in still runs the app, and the
// latest release number is public either way.
app.use("/app", appVersionRouter);
app.use("/auth", authRouter);
app.use("/sync", syncRouter);
// Unauthenticated by design: the share code is the credential (see routes/family.ts).
app.use("/family", familyRouter);
app.use("/reports", reportsRouter);

// Order matters: unmatched routes become 404s, then every error is shaped by
// the single error handler.
app.use(notFound);
app.use(errorHandler);
