import { Resend } from "resend";

import { env } from "../config/env.js";
import { ApiError } from "./ApiError.js";

// Constructed lazily: `new Resend("")` throws at module load, which would
// crash the server on boot before the key is read. Deferring to first use lets
// the password-reset route (which checks `env.resendApiKey`) report a clean
// 503 instead when email isn't configured.
let resend: Resend | null = null;

function client(): Resend {
  if (!env.resendApiKey) {
    throw ApiError.internal("Email is not configured");
  }
  if (!resend) {
    resend = new Resend(env.resendApiKey);
  }
  return resend;
}

/**
 * Emails a password-reset code. The caller is responsible for checking that
 * `env.resendApiKey` / `env.resendFrom` are configured before invoking this.
 *
 * Resend v6's `emails.send` resolves to a `{ data, error }` result rather than
 * throwing, so we surface a failed send explicitly instead of silently
 * returning success.
 */
export async function sendPasswordResetEmail(
  to: string,
  code: string,
): Promise<void> {
  const { error } = await client().emails.send({
    from: env.resendFrom,
    to,
    subject: "Reset your OwnMed password",
    text:
      `Your OwnMed password reset code is ${code}. It expires in 15 minutes.\n\n` +
      "If you didn't request this, you can ignore this email.",
  });

  if (error) {
    console.error("[email] failed to send reset code:", error.message);
    throw ApiError.internal("Failed to send the reset email");
  }
}
