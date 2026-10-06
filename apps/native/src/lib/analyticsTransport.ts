import { isNetworkError } from "#/utils/isNetworkError";

export type FailureKind = "permanent" | "server" | "transient";

/** oRPC v2 errors carry a `code`, not an HTTP status. */
function orpcCodeOf(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ORPCError" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return;
}

/** The server understood the request and refused it; resending cannot help. */
const PERMANENT_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_SUPPORTED",
  "NOT_ACCEPTABLE",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "UNPROCESSABLE_CONTENT",
]);

/** The server is fine; it asked us to wait. */
const TRANSIENT_CODES = new Set(["TOO_MANY_REQUESTS", "REQUEST_TIMEOUT"]);

/**
 * A 429 from the edge in front of the server (Railway's Under Attack Mode
 * answers non-browser clients this way) is not an oRPC reply, so it surfaces as
 * MALFORMED_ORPC_RESPONSE with the HTTP status text as its message. Nothing is
 * wrong with the events; the door is shut. Waiting is right, and counting it as
 * a failure would throw the events away after a few tries.
 */
const EDGE_BLOCK_MESSAGE = /too many requests/i;

/**
 * What a failed request means for the events in it.
 *
 * - `permanent`: the server refused the request itself. Resending the same
 *   events cannot succeed, and keeping them would block every event queued
 *   behind them for good.
 * - `server`: something answered but could not store them, or answered with
 *   something that is not a valid reply (a 5xx, a proxy error page, a route
 *   that no longer exists, an error we do not recognise). Retry, but only a
 *   few times.
 * - `transient`: no answer at all (offline, timeout), or the server asked us
 *   to slow down. Retry indefinitely; being offline is not the events' fault.
 */
export function classifyFailure(error: unknown): FailureKind {
  if (isNetworkError(error)) {
    return "transient";
  }
  const code = orpcCodeOf(error);
  if (code !== undefined && TRANSIENT_CODES.has(code)) {
    return "transient";
  }
  if (
    code === "MALFORMED_ORPC_RESPONSE" &&
    error instanceof Error &&
    EDGE_BLOCK_MESSAGE.test(error.message)
  ) {
    return "transient";
  }
  return code !== undefined && PERMANENT_CODES.has(code)
    ? "permanent"
    : "server";
}

export function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
