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

/**
 * When reads began to be recorded reliably. Earlier days have far fewer read
 * events than views, so any read figure that includes them is understated.
 */
export const READS_RELIABLE_FROM = "2026-10-11";

export const IMPRESSION_DEFINITION =
  "An impression is an article at least half on screen for at least one second. Click-through counts only views from a device that had already been shown the article; other opens (push, links, search) are shown as direct opens.";

/** The most events without an event id that go unmentioned, as a share. */
const EVENT_ID_NOTICE_ABOVE = 0.1;

export type Notice = { id: string; message: string };

/**
 * The caveats that apply to a period, given the period itself.
 *
 * Only what the period actually touches is returned: a window that starts
 * after `TRACKING_STARTED` has nothing to warn about.
 */
export function newsNotices(
  range: Range,
  quality?: { events: number; eventsWithoutId: number }
): Notice[] {
  const notices: Notice[] = [];

  if (range.current.from < TRACKING_STARTED) {
    notices.push({
      id: "tracking-started",
      message:
        "Impressions for Trending and Related, and shares through WhatsApp, Messenger, Twitter and Facebook, are only recorded by app versions from 19 Sep 2026. Earlier days, and readers on older versions, are missing them, so click-through reads low. Home feed impressions before then used a looser rule and read high.",
    });
  }

  if (range.current.from < READS_RELIABLE_FROM) {
    notices.push({
      id: "reads-understated",
      message:
        "Qualified reads were only recorded reliably from 11 Oct 2026. Reads and read rate for earlier days in this period are understated.",
    });
  } else if (range.previous.from < READS_RELIABLE_FROM) {
    notices.push({
      id: "reads-understated",
      message:
        "Qualified reads were only recorded reliably from 11 Oct 2026. The previous period starts earlier, so the change in reads and read rate against it is overstated.",
    });
  }

  if (
    quality &&
    quality.events > 0 &&
    quality.eventsWithoutId / quality.events > EVENT_ID_NOTICE_ABOVE
  ) {
    const share = Math.round((quality.eventsWithoutId / quality.events) * 100);
    notices.push({
      id: "no-event-id",
      message: `${share}% of events in this period come from app versions that cannot tell a resent event from a new one, so their counts can run high. It falls as readers update the app.`,
    });
  }

  return notices;
}
