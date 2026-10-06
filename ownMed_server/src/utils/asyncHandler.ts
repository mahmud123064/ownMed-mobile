import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Forwards rejected promises to Express's error middleware.
 *
 * Express 5 does this for async handlers on its own; the wrapper is kept so
 * route code stays explicit and keeps working if the router is ever downgraded.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
