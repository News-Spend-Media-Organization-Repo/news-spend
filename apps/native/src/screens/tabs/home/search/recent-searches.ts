export const RECENT_SEARCHES_KEY = "search:recent";
export const MAX_RECENT_SEARCHES = 8;

/** Newest first, de-duplicated case-insensitively, capped at eight. */
export function addRecentSearch(
  recent: readonly string[],
  query: string
): string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [...recent];
  }

  const withoutDuplicate = recent.filter(
    (item) => item.trim().toLowerCase() !== trimmed.toLowerCase()
  );

  return [trimmed, ...withoutDuplicate].slice(0, MAX_RECENT_SEARCHES);
}

export function removeRecentSearch(
  recent: readonly string[],
  query: string
): string[] {
  return recent.filter(
    (item) => item.trim().toLowerCase() !== query.trim().toLowerCase()
  );
}
