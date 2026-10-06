import type { RequestHandler } from "express";

import { ApiError } from "../utils/ApiError.js";

/** Terminal middleware: turns any unmatched route into a 404 ApiError. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};
