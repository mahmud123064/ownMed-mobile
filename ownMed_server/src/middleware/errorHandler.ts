import type { ErrorRequestHandler } from "express";

import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Centralized error middleware — the single place responses are shaped and
 * errors are logged. Must be registered last, after all routes.
 */
/**
 * Statuses for the errors `express.json()` produces before any route runs.
 *
 * They are not `ApiError`s, so without this they would fall through to the
 * generic 500 path — turning a client's malformed or oversized body into a
 * server error. The message is replaced rather than forwarded: body-parser's
 * text quotes fragments of the input, and none of it helps the caller.
 */
function bodyParserStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const type = (err as { type?: unknown }).type;
  if (type === "entity.parse.failed") return 400;
  if (type === "entity.too.large") return 413;
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const isApiError = err instanceof ApiError;
  const parserStatus = isApiError ? undefined : bodyParserStatus(err);
  const statusCode = isApiError ? err.statusCode : (parserStatus ?? 500);
  // Never leak an unexpected error's message to the client.
  const message = isApiError
    ? err.message
    : parserStatus === 400
      ? "Invalid JSON body"
      : parserStatus === 413
        ? "Request body too large"
        : "Internal server error";

  if (statusCode >= 500) {
    console.error("[error]", err);
  } else {
    console.warn(`[warn] ${statusCode} ${message}`);
  }

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
      ...(env.isProduction || !(err instanceof Error)
        ? {}
        : { stack: err.stack }),
    },
  });
};
