import { entries2026 } from "./2026";

/**
 * Every entry, newest first. Keep old years in their own files; this merge is
 * small and the page sorts the result anyway.
 */
export const entries = [...entries2026].sort((a, b) =>
  b.date.localeCompare(a.date)
);

/** The entry the "new" marker compares against. */
export const latestEntry = () => entries[0];
