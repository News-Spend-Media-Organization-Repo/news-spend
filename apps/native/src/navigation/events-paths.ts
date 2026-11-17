/**
 * The paths the events screens answer to: one source for the navigator, the
 * return-link rewrite and the tests, so a rename cannot silently 404.
 */
export const EVENTS_PATHS = {
  order: "events/order/:reference",
  return: "events/return",
} as const;

/** The one URL registered with Shows as the order return. */
export const EVENTS_RETURN_URL = `https://link.newsspend.com/${EVENTS_PATHS.return}`;

/**
 * The order path for a reference, encoded once as a URL segment. The router
 * decodes it back, so the screen itself receives the raw reference.
 */
export function eventsOrderPath(reference: string) {
  return EVENTS_PATHS.order.replace(":reference", () =>
    encodeURIComponent(reference)
  );
}
