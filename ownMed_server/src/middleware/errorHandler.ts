import type { ErrorRequestHandler } from "express";

import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Centralized error middleware — the single place responses are shaped and
 * errors are logged. Must be registered last, after all routes.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : 500;
  // Never leak an unexpected error's message to the client.
  const message = isApiError ? err.message : "Internal server error";

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
