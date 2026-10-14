import type { CollectionBeforeChangeHook } from "payload";

/** How long a story stays featured when an admin does not choose. */
export const DEFAULT_FEATURED_HOURS = 24;

type FeaturedFields = {
  featured?: boolean | null;
  featuredUntil?: string | Date | null;
};

/**
 * Decides what `featuredUntil` should be for a write.
 *
 * - Featuring a story with no end time stamps one, so nothing stays on the
 *   carousel because an admin forgot it. Only the moment `featured` flips on
 *   counts: a story that was already featured before this existed has no end
 *   time and keeps none, so editing a typo in it does not start a countdown.
 * - Un-featuring clears the end time, so a later re-feature starts from a
 *   fresh window instead of inheriting a stale one.
 * - An end time the admin chose is never overridden.
 */
export function resolveFeaturedUntil({
  data,
  originalDoc,
  now = new Date(),
}: {
  data: FeaturedFields;
  originalDoc?: FeaturedFields | null;
  now?: Date;
}): FeaturedFields["featuredUntil"] | undefined {
  if (data.featured === false) {
    return null;
  }

  const turnedOn = data.featured === true && !originalDoc?.featured;
  if (turnedOn && !data.featuredUntil) {
    return new Date(
      now.getTime() + DEFAULT_FEATURED_HOURS * 60 * 60 * 1000
    ).toISOString();
  }

  return;
}

export const applyFeaturedWindow: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
}) => {
  if (!data) {
    return data;
  }

  const featuredUntil = resolveFeaturedUntil({ data, originalDoc });
  if (featuredUntil !== undefined) {
    data.featuredUntil = featuredUntil;
  }

  return data;
};
