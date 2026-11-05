export const MIN_SEARCH_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 350;

/** What gets sent to the API: collapsed whitespace, no surrounding space. */
export function normalizeSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isSearchableQuery(value: string): boolean {
  return normalizeSearchQuery(value).length >= MIN_SEARCH_LENGTH;
}
