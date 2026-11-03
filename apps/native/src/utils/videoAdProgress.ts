export type VideoEvent =
  | "video_start"
  | "video_25"
  | "video_50"
  | "video_75"
  | "video_complete";

const QUARTILES: readonly [VideoEvent, number][] = [
  ["video_25", 0.25],
  ["video_50", 0.5],
  ["video_75", 0.75],
];

/**
 * Depth events crossed at `currentTime` that have not fired yet.
 *
 * Completion also fires when the remaining time is within one sampling
 * interval: Android's looping player never emits `playToEnd`, and with a 0.5s
 * sample a 5s ad tops out at 4.5s, so an end-of-stream event alone would report
 * zero completions for exactly the short creatives this measures.
 */
export function videoEventsAt(
  currentTime: number,
  duration: number,
  fired: ReadonlySet<VideoEvent>,
  intervalSeconds: number
): VideoEvent[] {
  if (!(duration > 0 && currentTime >= 0)) {
    return [];
  }

  const fraction = currentTime / duration;
  const events: VideoEvent[] = [];

  for (const [event, at] of QUARTILES) {
    if (fraction >= at && !fired.has(event)) {
      events.push(event);
    }
  }

  if (
    !fired.has("video_complete") &&
    (fraction >= 1 || duration - currentTime <= intervalSeconds)
  ) {
    events.push("video_complete");
  }

  return events;
}
