/**
 * What an analytics event may carry as extra detail, held to sane bounds.
 *
 * The app sends this and the server cannot check it, so a modified client could
 * send a time of a trillion seconds or a label a megabyte long. Nothing shown
 * today reads the numbers, but the day a chart averages them, one such value
 * would ruin it, and unbounded labels would let anyone invent as many "share
 * methods" as they like.
 *
 * It is *held*, not *refused*. Refusing the request would make the app treat it
 * as a permanent failure and drop the whole batch it arrived in, taking honest
 * events with it, including from older builds. So an out-of-range value is pulled
 * back to the nearest bound, and a value that is not usable at all is left out.
 *
 * The bounds are deliberately wide. They exist to stop nonsense, not to police
 * real values: no legitimate reading in any build should be changed by them.
 */

export type EventMetadataInput = {
  position?: number;
  screen?: string;
  timeSpent?: number;
  scrollDepth?: number;
  shareMethod?: string;
};

/** Ranks in a list: nothing real is anywhere near a thousand deep. */
const MAX_POSITION = 1000;
/** Seconds. A whole day is far longer than anyone reads one article. */
const MAX_TIME_SPENT = 24 * 60 * 60;
/** A depth is 0 to 1 today; 100 leaves room for a build that sent a percentage. */
const MAX_SCROLL_DEPTH = 100;

const MAX_LABEL_LENGTH = 64;

function bounded(value: unknown, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return;
  }
  return Math.min(Math.max(value, 0), max);
}

function label(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim().slice(0, MAX_LABEL_LENGTH);
  return trimmed === "" ? undefined : trimmed;
}

export function sanitizeEventMetadata(
  metadata: EventMetadataInput | undefined
): Record<string, number | string> {
  if (!metadata) {
    return {};
  }

  const position = bounded(metadata.position, MAX_POSITION);
  const clean: Record<string, number | string | undefined> = {
    // A position is a whole rank.
    position: position === undefined ? undefined : Math.round(position),
    screen: label(metadata.screen),
    timeSpent: bounded(metadata.timeSpent, MAX_TIME_SPENT),
    scrollDepth: bounded(metadata.scrollDepth, MAX_SCROLL_DEPTH),
    shareMethod: label(metadata.shareMethod),
  };

  return Object.fromEntries(
    Object.entries(clean).filter(
      (entry): entry is [string, number | string] => entry[1] !== undefined
    )
  );
}
