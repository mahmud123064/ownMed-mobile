import { z } from "zod";

import { ApiError } from "./ApiError.js";

/**
 * Runs a zod schema over an unknown request body and returns the parsed value,
 * throwing a 400 ApiError with the first validation message on failure.
 */
export function validate<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") || "body";
    throw ApiError.badRequest(`${path}: ${issue?.message ?? "invalid value"}`);
  }
  return result.data;
}
