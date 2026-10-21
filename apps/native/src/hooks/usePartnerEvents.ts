import { partnerEventsClient } from "#/lib/partnerEventsClient";
import type { AdPlacement } from "#/state/adManager";

/**
 * Impressions already counted, keyed by session. The key carries the session
 * id, so a new session counts again; the set is cleared when the id changes so
 * it cannot grow without bound.
 */
const seenImpressions = new Set<string>();
let seenSessionId: string | null = null;

function trackImpression(
  contentId: string,
  surface: AdPlacement,
  position?: number
): void {
  const sessionId = partnerEventsClient.currentSessionId();
  if (sessionId !== seenSessionId) {
    seenImpressions.clear();
    seenSessionId = sessionId;
  }
  const key = `${sessionId}:${contentId}:${surface}`;
  if (seenImpressions.has(key)) {
    return;
  }
  seenImpressions.add(key);
  partnerEventsClient.enqueue({
    contentId,
    event: "impression",
    surface,
    position,
  });
}

function trackClick(
  contentId: string,
  surface: AdPlacement,
  position?: number
): void {
  partnerEventsClient.enqueue({
    contentId,
    event: "click",
    surface,
    position,
  });
}

const api = { trackImpression, trackClick };

export function usePartnerEvents() {
  return api;
}

/** Test seam: forget what was counted. */
export function resetPartnerImpressionsForTests(): void {
  seenImpressions.clear();
  seenSessionId = null;
}
