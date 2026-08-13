/**
 * Shared error definitions for the API layer.
 *
 * Every procedure built on `basicProcedure` and every auth/rate-limit
 * middleware declares these codes via `.errors()`. Throwing with the
 * `errors.CODE()` factory (available in handler and middleware context)
 * marks the error as defined/inferable, so clients can narrow it with
 * `isDefinedError` / `isInferableError` and react to specific codes.
 */
export const commonErrors = {
  BAD_REQUEST: { message: "Bad request" },
  UNAUTHORIZED: { message: "Unauthorized" },
  FORBIDDEN: { message: "Forbidden" },
  NOT_FOUND: { message: "Resource not found" },
  CONFLICT: { message: "Conflict" },
  TOO_MANY_REQUESTS: { message: "Too many requests", status: 429 },
  INPUT_VALIDATION_FAILED: { message: "Invalid input", status: 422 },
  INTERNAL_SERVER_ERROR: { message: "Internal server error" },
};
