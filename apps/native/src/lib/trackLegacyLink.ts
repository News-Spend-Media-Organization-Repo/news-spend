import * as Sentry from "@sentry/react-native";

/** Where an inbound URL entered the app. */
export type LegacyLinkSource =
  | "initial-url" // cold start, from a deep link
  | "incoming-url" // app already running: a link opened, or a widget tap
  | "notification" // the `url` on a notification payload
  | "detour"; // a Detour deferred deep link

/**
 * Records that an inbound URL still carried a legacy tab segment.
 *
 * TEMPORARY, and the only reason it exists: to answer whether any links still
 * arrive in the pre-refactor `news/article/<slug>` form, and if so from where,
 * so `normalizeLegacyTabPrefix` can be deleted once the answer is "no". The
 * aliases on the news routes already cover every shape this app is known to
 * mint, so the strip is down to whatever is still out there in the wild — which
 * is not something a code search can tell us.
 *
 * It is a Sentry *log*, not an issue: free-form, off-device, and searchable, so
 * it adds nothing to the backlog that E0/AJ/DA just cleared. Logs need the
 * `enableLogs` option, which `initSentry` already sets.
 *
 * Remove this alongside the module it instruments.
 */
export function trackLegacyTabLink(input: {
  tab: string;
  source: LegacyLinkSource;
}): void {
  Sentry.logger.info("legacy tab prefix stripped", {
    tab: input.tab,
    source: input.source,
  });
}
