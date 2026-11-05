import { isDefinedError, type ORPCError } from "@orpc/client";

/**
 * The API said the thing does not exist, as opposed to the request failing.
 * The parameter lists `ORPCError` because `isDefinedError` narrows by
 * `Extract`: a bare `Error` would narrow to `never`.
 */
export const isNotFoundError = (
  error: Error | ORPCError<string, unknown> | null
) => isDefinedError(error) && error.code === "NOT_FOUND";
