import * as Sentry from "@sentry/nextjs";

import {
  SENTRY_DSN,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_RELEASE,
  SENTRY_TRACES_SAMPLE_RATE,
} from "./sentry.shared";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: SENTRY_ENABLED,
  environment: SENTRY_ENVIRONMENT,
  release: SENTRY_RELEASE,
  sendDefaultPii: true,
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  enableLogs: true,
  beforeSend(event) {
    // The client went away mid-request (CMS-2A: `Error: aborted` from
    // node:_http_server on media uploads). Nothing failed server-side, so
    // there is nothing to fix — drop it instead of filing an issue.
    const values = event.exception?.values ?? [];
    if (
      values.some(
        (v) => v.type === "Error" && (v.value ?? "").trim() === "aborted"
      )
    ) {
      return null;
    }
    return event;
  },
});
