import "dotenv/config";

/**
 * Single source of truth for configuration.
 *
 * Everything reads from here rather than touching `process.env` directly, so a
 * missing or malformed variable fails loudly at startup instead of surfacing as
 * a confusing runtime error later.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Copy .env.example to .env and set it.`,
    );
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

// Report storage (Cloudflare R2). Optional at boot, like Resend — the server
// has plenty to do without them, and the report routes report a clean 503 until
// all four are set. Read out here rather than inline so `r2Configured` can be
// derived from them without reaching back into the frozen object.
const r2Endpoint = process.env.R2_ENDPOINT ?? "";
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
const r2Bucket = process.env.R2_BUCKET ?? "";

export const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  // Neon requires TLS; only a local Postgres would want this off.
  databaseSsl: (process.env.DATABASE_SSL ?? "true") !== "false",
  // Access-token signing key. Required — the server must not boot without it.
  jwtSecret: required("JWT_SECRET"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  refreshTokenExpiresDays: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30),
  // Email (Resend) — used to send password-reset codes. Optional at boot; the
  // password-reset routes return a clear error until these are set.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFrom: process.env.RESEND_FROM ?? "OwnMed <onboarding@resend.dev>",
  // Report storage (Cloudflare R2) — holds uploaded lab reports, scans and
  // prescriptions. Optional at boot; the report routes return a clear 503 until
  // these are set, exactly as the password-reset routes do without Resend.
  r2Endpoint,
  r2AccessKeyId,
  r2SecretAccessKey,
  r2Bucket,
  // Optional. When set, the bucket is served through a public domain (or a
  // Cloudflare CDN in front of it) and downloads are plain URLs instead of
  // presigned ones. Left empty for the private-bucket setup the upload flow
  // assumes, where every download URL is signed and short-lived.
  r2PublicUrl: process.env.R2_PUBLIC_URL ?? "",
  // Everything the S3 client needs. A partial configuration is treated as no
  // configuration rather than booting a client that fails on first upload.
  r2Configured:
    r2Endpoint !== "" &&
    r2AccessKeyId !== "" &&
    r2SecretAccessKey !== "" &&
    r2Bucket !== "",
  // App release info, served by `GET /app/version` so an installed build can
  // ask whether a newer one exists. Optional: with `latestAppVersion` empty the
  // route announces nothing and the client shows no notice — the correct state
  // for a fresh clone and for the window before a first release. Read from here
  // rather than derived from this package's own version, because the whole
  // point of the check is a value that can move without shipping a build.
  latestAppVersion: process.env.LATEST_APP_VERSION ?? "",
  // Where an update notice sends the user. Kept beside the version instead of
  // derived per-platform, since the store listing may not exist yet; empty
  // renders the notice as information with nothing to tap.
  storeUrl: process.env.STORE_URL ?? "",
  // Browser origins allowed to call the API, comma-separated. The mobile app
  // sends no `Origin` and is never subject to CORS, so an empty list costs it
  // nothing; in production an empty list is a deny for web clients.
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== ""),
  // Set true only when a reverse proxy sits in front of this process. Without
  // it the proxy's address is the client address as far as Express is
  // concerned, so every caller would share one rate-limit bucket; with it set
  // when nothing rewrites `X-Forwarded-For`, a client can forge its own IP and
  // bypass the limit — hence opt-in rather than on by default.
  trustProxy: (process.env.TRUST_PROXY ?? "false") === "true",
});

export type Env = typeof env;
