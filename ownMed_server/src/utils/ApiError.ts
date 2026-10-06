/**
 * Error carrying an HTTP status code.
 *
 * Anything thrown that is *not* an `ApiError` is treated as an unexpected bug
 * and reported to the client as a generic 500 — see `middleware/errorHandler`.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  /** False for programmer errors, true for expected/operational failures. */
  readonly isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = "Bad request"): ApiError {
    return new ApiError(400, message);
  }

  static unauthorized(message = "Unauthorized"): ApiError {
    return new ApiError(401, message);
  }

  static notFound(message = "Not found"): ApiError {
    return new ApiError(404, message);
  }

  static internal(message = "Internal server error"): ApiError {
    return new ApiError(500, message, false);
  }
}
