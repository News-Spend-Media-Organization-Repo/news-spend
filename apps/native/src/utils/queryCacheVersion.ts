/**
 * Bump when an OTA update ships a change in the shape of cached API responses.
 *
 * The persisted query cache is otherwise keyed on the native app version only,
 * and an EAS OTA update does not change that, so stale cached responses would
 * survive the update.
 */
export const QUERY_CACHE_VERSION = "2026-10-partner-offers-1";
