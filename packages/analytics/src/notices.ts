import type { Range } from "./range";

/**
 * What a reader of the numbers needs to know to read them correctly.
 *
 * These are facts about how the app counts, not about the data: they sit here,
 * next to the queries, so a dashboard cannot show a figure without the caveat
 * that belongs to it being available.
 */

/** When the app began recording the events below. Local calendar date. */
export const TRACKING_STARTED = "2026-09-19";

export const READ_DEFINITION =
  "A read is about 90 seconds of active reading with 85% of the article scrolled.";

export const IMPRESSION_DEFINITION =
  "An impression is an article at least half on screen for at least one second.";

export type Notice = { id: string; message: string };

/**
 * The caveats that apply to a period, given the period itself.
 *
 * Only what the period actually touches is returned: a window that starts
 * after `TRACKING_STARTED` has nothing to warn about.
 */
export function newsNotices(range: Range): Notice[] {
  const notices: Notice[] = [];

  if (range.current.from < TRACKING_STARTED) {
    notices.push({
      id: "tracking-started",
      message:
        "Impressions for Trending and Related, and shares through WhatsApp, Messenger, Twitter and Facebook, are only recorded by app versions from 19 Sep 2026. Earlier days, and readers on older versions, are missing them, so click-through reads low. Home feed impressions before then used a looser rule and read high.",
    });
  }

  return notices;
}
