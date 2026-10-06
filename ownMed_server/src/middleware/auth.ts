import type { RequestHandler } from "express";

import { ApiError } from "../utils/ApiError.js";
import { verifyAccessToken } from "../utils/tokens.js";

/**
 * Requires a valid `Authorization: Bearer <accessToken>` header and attaches
 * the decoded user (`{ id, email }`) to `req.user`.
 *
 * The access token is verified from its signature + expiry only — no DB hit —
 * so this middleware trusts the token's claims. Routes that need fresh user
 * data (name, phone, …) should query the `users` table themselves.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing bearer token"));
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
    };
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired token"));
  }
};
