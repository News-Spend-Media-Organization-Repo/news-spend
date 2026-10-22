/**
 * Placements where an ad can pay points. Partner ads must never pay points
 * from any other surface (news feed, click ads, ...).
 *
 * Offer placements pay when the user taps; engagement (Boost) placements pay
 * on watch completion, never on tap.
 */
export const OFFER_PLACEMENTS = [
  "points-mall-books",
  "points-mall-apps",
  "lucky-app-wall",
] as const;

export const ENGAGEMENT_PLACEMENTS = [
  "connect-brand-video",
  "connect-brands-tab",
] as const;

const offerSet: ReadonlySet<string> = new Set(OFFER_PLACEMENTS);
const engagementSet: ReadonlySet<string> = new Set(ENGAGEMENT_PLACEMENTS);

export const isOfferPlacement = (placement: string): boolean =>
  offerSet.has(placement);

export const isEarnPlacement = (placement: string): boolean =>
  offerSet.has(placement) || engagementSet.has(placement);

/** True only for a non-empty list made up entirely of earn placements. */
export const isEarnRequest = (
  placements: readonly string[] | undefined
): boolean =>
  placements !== undefined &&
  placements.length > 0 &&
  placements.every(isEarnPlacement);

/**
 * Whether a tap may pay points. `placements` is the item's own placements.
 * With a surface, it must be an offer placement the item is placed on. Without
 * one, any offer placement on the item is enough.
 */
export const canPayOnTap = ({
  surface,
  placements,
}: {
  surface: string | undefined;
  placements: readonly string[];
}): boolean => {
  if (surface === undefined) {
    return placements.some(isOfferPlacement);
  }
  return isOfferPlacement(surface) && placements.includes(surface);
};
