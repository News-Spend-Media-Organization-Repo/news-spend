export type TrendingDirection = 1 | -1;

/** Where the Trending section sits in the feed, and whether it is on screen. */
export type TrendingVisibility = {
  visible: boolean;
  top: number;
  bottom: number;
};

/** Feed `contentContainerStyle.paddingTop`; header coordinates sit below it. */
export const FEED_PADDING_TOP = 15;

export const TRENDING_AUTO_ADVANCE_MS = 5000;

export const createTrendingVisibility = (): TrendingVisibility => ({
  visible: true,
  top: 0,
  bottom: Number.POSITIVE_INFINITY,
});

/**
 * Next card for the auto-scrolling carousel. Bounces at both ends rather than
 * wrapping, so no card is duplicated and none is re-counted as an impression.
 */
export const nextTrendingIndex = (
  current: number,
  count: number,
  direction: TrendingDirection
): { index: number; direction: TrendingDirection } => {
  if (count <= 1) {
    return { index: current, direction };
  }
  const next = current + direction;
  if (next >= count) {
    return { index: count - 2, direction: -1 };
  }
  if (next < 0) {
    return { index: 1, direction: 1 };
  }
  return { index: next, direction };
};
