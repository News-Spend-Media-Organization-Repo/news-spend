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
    // Pasting or dragging an external image URL into the news editor makes
    // the rich-text field fetch it for upload, and the source site often
    // refuses cross-origin reads (CMS-28/2X/2Y: `TypeError: Failed to fetch`
    // for cdn.punchng.com and other hotlink-protected hosts). That is the
    // source site's hotlink protection, not a CMS bug — drop it instead of
    // filing an issue. Scoped to fetch failures inside the lexical field's
    // own paste/drop handler so real network failures still report.
    const values = event.exception?.values ?? [];
    const isFailedFetch = values.some(
      (v) =>
        (v.type === "TypeError" || v.type === undefined) &&
        (v.value ?? "").includes("Failed to fetch")
    );
    if (isFailedFetch) {
      const inLexicalPasteHandler = values.some((v) =>
        (v.stacktrace?.frames ?? []).some((f) =>
          (f.filename ?? "").includes("richtext-lexical")
        )
      );
      if (inLexicalPasteHandler) {
        return null;
      }
    }
    return event;
  },
});

// Feeds navigation timing into the traces above; without it client-side route
// changes in the Payload admin produce no transactions.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
