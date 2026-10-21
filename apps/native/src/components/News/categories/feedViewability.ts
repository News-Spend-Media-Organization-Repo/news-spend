import { IMPRESSION_VIEWABILITY_CONFIG } from "#/hooks/news/useImpressionViewability";

/**
 * LegendList keeps one viewability state per `viewabilityConfig.id`. Configs
 * without an id all share the state stored under `undefined`, so the first
 * pair to run overwrites the "currently viewable" set and every later pair
 * sees an empty `changed`. Every config a feed list passes therefore needs its
 * own defined id.
 */

/**
 * Drives the feed's mechanics: pausing a carousel that scrolled away and
 * preloading the next Google ad slots. Deliberately loose and immediate:
 * these want to fire as early as possible, and delaying a preload leaves an
 * ad slot blank for longer.
 */
export const MECHANICS_VIEWABILITY_CONFIG = {
  id: "mechanics",
  itemVisiblePercentThreshold: 40,
};

export const ARTICLE_IMPRESSION_VIEWABILITY_CONFIG = {
  ...IMPRESSION_VIEWABILITY_CONFIG,
  id: "article-impression",
};

/** The category tab's ad-preload config: what the library defaults to, plus an id. */
export const AD_PRELOAD_VIEWABILITY_CONFIG = {
  id: "ad-preload",
  viewAreaCoveragePercentThreshold: 0,
};

type PartnerPair = { viewabilityConfig: { id: string } };

/** Pairs for the home feed list (Latest). */
export function buildLatestViewabilityPairs<M, A, P extends PartnerPair>(
  mechanics: M,
  articleImpression: A,
  partnerPairs: P[]
) {
  return [
    {
      viewabilityConfig: MECHANICS_VIEWABILITY_CONFIG,
      onViewableItemsChanged: mechanics,
    },
    {
      viewabilityConfig: ARTICLE_IMPRESSION_VIEWABILITY_CONFIG,
      onViewableItemsChanged: articleImpression,
    },
    ...partnerPairs,
  ];
}

/**
 * Props for a category tab list. The ad-preload handler goes through the
 * `viewabilityConfig` + `onViewableItemsChanged` props, which the library turns
 * into a pair, so the config gets an explicit id rather than the id-less
 * default. Kept as props (not a second pair) so the handler stays as is.
 */
export function buildCategoryViewabilityProps<P extends PartnerPair>(
  partnerPairs: P[]
) {
  return {
    viewabilityConfig: AD_PRELOAD_VIEWABILITY_CONFIG,
    viewabilityConfigCallbackPairs: partnerPairs,
  };
}
