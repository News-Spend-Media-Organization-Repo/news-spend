import type { AdPlacement } from "#/state/adManager";

/**
 * The surface to report an ad event under.
 *
 * The events endpoint drops a surface the item does not list, so a Boost item
 * carrying only the tab placement would lose every event if the screen name
 * were sent as-is. Prefer the caller's surface, then any other placement this
 * dialog asked for, then the caller's surface as a last resort.
 */
export function resolveAdSurface(
  ad: { placements?: string[] | null },
  preferred: AdPlacement,
  requested: AdPlacement[]
): AdPlacement {
  const listed = ad.placements ?? [];
  if (listed.includes(preferred)) {
    return preferred;
  }
  return requested.find((placement) => listed.includes(placement)) ?? preferred;
}
