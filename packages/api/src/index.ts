import { ORPCError, os } from "@orpc/server";
import * as Sentry from "@sentry/node";

import type { Context } from "./context";
import { commonErrors } from "./errors";
import { rateLimitMiddleware } from "./lib/ratelimit";
import { requireSupportedAppVersion } from "./middlewares/appVersion.middleware";
import {
  optionalAuth,
  requireAuth,
  requireAuthNoGuest,
} from "./middlewares/auth.middleware";
import { recordLastActive } from "./middlewares/lastActive.middleware";

/**
 * oRPC keeps the schema issues on the error's data, not in its message, so an
 * input-validation report only said "Input validation failed" (API-B: 58 users
 * and no way to tell which field). Path and message are enough to name the
 * offending field; the received value is left out so no request data is sent.
 */
function describeValidationIssues(
  error: ORPCError<string, unknown>
): unknown[] | undefined {
  const data = error.data;
  const issues =
    typeof data === "object" && data !== null && "issues" in data
      ? data.issues
      : undefined;
  if (!Array.isArray(issues)) {
    return;
  }
  return issues.map(
    (issue: { message?: string; path?: readonly unknown[] }) => ({
      // Standard-schema paths are `{ key }` wrappers; unwrap for readability.
      path: issue.path?.map((part) =>
        typeof part === "object" && part !== null && "key" in part
          ? (part as { key: unknown }).key
          : part
      ),
      message: issue.message,
    })
  );
}

export const sentryMiddleware = os.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Expected client errors (UNAUTHORIZED, NOT_FOUND, validation failures,
    // UPGRADE_REQUIRED, …) are thrown via the `errors.CODE()` factories as
    // *defined* ORPCErrors — the client already handles them (login screens,
    // empty states, update prompts). Reporting each one created the bulk of
    // the newspend-api backlog (API-F/B/K/C/8/7/A). Only unexpected failures
    // and explicit INTERNAL_SERVER_ERRORs are worth an issue.
    const isExpected =
      error instanceof ORPCError &&
      error.defined &&
      error.code !== "INTERNAL_SERVER_ERROR";
    if (!isExpected) {
      const validationIssues =
        error instanceof ORPCError
          ? describeValidationIssues(error)
          : undefined;
      Sentry.captureException(
        error,
        validationIssues ? { extra: { validationIssues } } : undefined
      );
    }
    throw error;
  }
});

export const basicProcedure = os
  .$context<Context>()
  .errors(commonErrors)
  .use(sentryMiddleware)
  // Before anything else, including auth: an unsupported build should be told
  // to update rather than told its credentials are wrong.
  .use(requireSupportedAppVersion);
export const publicProcedure = basicProcedure.use(optionalAuth);
// Activity is recorded after auth, so the middleware has a user to attribute
// it to. Public procedures record too: a reader browsing news while signed in
// is active, and only counting the authenticated-only calls would make the
// segments measure engagement with a subset of the app.
export const protectedProcedure = basicProcedure
  .use(requireAuth)
  .use(recordLastActive);
export const protectedNoGuestProcedure = basicProcedure
  .use(requireAuthNoGuest)
  .use(recordLastActive);

export const rateLimitedPublicProcedure =
  publicProcedure.use(rateLimitMiddleware);
