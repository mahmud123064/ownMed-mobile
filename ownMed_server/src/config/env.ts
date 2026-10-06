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
});

export type Env = typeof env;
