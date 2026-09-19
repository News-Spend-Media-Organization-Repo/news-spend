import { useEffect, useRef } from "react";

import { useNewsAnalytics } from "#/hooks/news/useNewsAnalytics";

/**
 * Drives impression counting, and follows the IAB display standard: at least
 * 50% of the item on screen for at least one continuous second.
 *
 * Separate from the feed's mechanics config because the two want opposite
 * things. An impression has to be earned — the old shared 40%-and-no-dwell rule
 * counted anything that swept past during a fast scroll, which inflates the
 * denominator of every rate computed from it. Ad impressions, when they land,
 * belong on this config rather than a fourth one: a number that is billed
 * against has to survive an advertiser measuring it themselves.
 */
export const IMPRESSION_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 1000,
};

/**
 * Only the fields an impression callback reads. A feed is a union of articles,
 * ads and injected rows, and naming the whole union would couple every list to
 * the composer's output type for no benefit.
 */
export type ImpressionToken = {
  index: number;
  isViewable: boolean;
  item?: {
    type?: string | null;
    id?: string;
    slug?: string | null;
    _type?: string;
    data?: { type?: string | null; id?: string; slug?: string | null }[];
  } | null;
};

/**
 * Impression tracking for a list whose every item is an article and whose own
 * viewport is what the reader sees, such as the carousel at the top of the
 * home feed.
 *
 * Not for a list nested inside a scrolling parent. Its viewport is its own, not
 * the screen, so it would count items the reader has not scrolled to.
 */
export function useImpressionViewability(screen: string) {
  const { trackImpression } = useNewsAnalytics();
  const trackRef = useRef(trackImpression);
  useEffect(() => {
    trackRef.current = trackImpression;
  }, [trackImpression]);

  // Stable, because the list re-reads it whenever the reference changes.
  return useRef([
    {
      viewabilityConfig: IMPRESSION_VIEWABILITY_CONFIG,
      onViewableItemsChanged: ({ changed }: { changed: ImpressionToken[] }) => {
        for (const token of changed) {
          if (token.isViewable && token.item?.id) {
            trackRef.current(
              { id: token.item.id, slug: token.item.slug },
              token.index,
              screen
            );
          }
        }
      },
    },
  ]).current;
}
