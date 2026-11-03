import { useEffect, useRef } from "react";

import { IMPRESSION_VIEWABILITY_CONFIG } from "#/hooks/news/useImpressionViewability";
import { usePartnerEvents } from "#/hooks/usePartnerEvents";
import type { AdPlacement } from "#/state/adManager";

/** Its own id: the list shares viewability state between configs with the same one. */
export const PARTNER_IMPRESSION_VIEWABILITY_CONFIG = {
  ...IMPRESSION_VIEWABILITY_CONFIG,
  id: "partner-impression",
};

/**
 * The feed's in-house ads come from the pool the ad manager fetches with
 * "homepage-ads-banner". Promo media is fetched by type alone, with no
 * placement of its own, and sits in the same home feed, so it is counted under
 * the same surface.
 */
const FEED_SURFACE: AdPlacement = "homepage-ads-banner";

/**
 * The rows are a union the list types for itself, and the unions differ
 * between lists, so the callback takes the item as `unknown` and reads only the
 * fields it needs.
 */
type PartnerFeedToken = {
  index: number | null;
  isViewable: boolean;
  item?: unknown;
};

function partnerAdRowId(item: unknown): string | undefined {
  if (!item || typeof item !== "object") {
    return;
  }
  const row = item as {
    _type?: unknown;
    type?: unknown;
    payload?: { id?: unknown } | null;
  };
  const isPartnerRow =
    (row._type === "ad" && row.type !== "gAd") ||
    row._type === "promotionMedia";
  const id = row.payload?.id;
  return isPartnerRow && typeof id === "string" ? id : undefined;
}

/** A direct partner content row, as the Discover lists hold them. */
export function partnerContentRowId(item: unknown): string | undefined {
  if (!item || typeof item !== "object") {
    return;
  }
  const row = item as { id?: unknown; type?: unknown };
  return typeof row.id === "string" && row.type !== "gAd" ? row.id : undefined;
}

type PartnerImpressionOptions = {
  /** The placement the list was fetched with. */
  surface?: AdPlacement;
  /** How to read the content id out of one row; lists wrap them differently. */
  contentIdFor?: (item: unknown) => string | undefined;
};

/**
 * Partner impression tracking for a top-level list: in-house ad rows, promo
 * media, or partner content items. Paired with IMPRESSION_VIEWABILITY_CONFIG,
 * so `isViewable` means 50% for one second.
 *
 * Only for a list whose viewport is the screen. A carousel nested inside a
 * scrolling parent has no viewability of its own, and its items would never
 * be reported.
 */
export function usePartnerImpressionViewability({
  surface = FEED_SURFACE,
  contentIdFor = partnerAdRowId,
}: PartnerImpressionOptions = {}) {
  const { trackImpression } = usePartnerEvents();
  const trackRef = useRef(trackImpression);
  useEffect(() => {
    trackRef.current = trackImpression;
  }, [trackImpression]);

  const surfaceRef = useRef(surface);
  const contentIdForRef = useRef(contentIdFor);
  useEffect(() => {
    surfaceRef.current = surface;
    contentIdForRef.current = contentIdFor;
  }, [surface, contentIdFor]);

  // Stable, because the list re-reads it whenever the reference changes.
  return useRef([
    {
      viewabilityConfig: PARTNER_IMPRESSION_VIEWABILITY_CONFIG,
      onViewableItemsChanged: ({
        changed,
      }: {
        changed: PartnerFeedToken[];
      }) => {
        for (const token of changed) {
          if (!token.isViewable) {
            continue;
          }
          const contentId = contentIdForRef.current(token.item);
          if (contentId) {
            trackRef.current(
              contentId,
              surfaceRef.current,
              token.index ?? undefined
            );
          }
        }
      },
    },
  ]).current;
}
