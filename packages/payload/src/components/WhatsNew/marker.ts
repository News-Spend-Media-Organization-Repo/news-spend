const STORAGE_PREFIX = "whats-new:last-seen:";
const DATE = /^\d{4}-\d\d-\d\d$/;

/**
 * Whether the newest entry is newer than the one this member last opened.
 *
 * Missing or unreadable stored values count as unread: showing the dot once
 * too often is harmless, hiding a real update is not.
 */
export function isNewestUnread(
  newestDate: string,
  stored: string | null | undefined
): boolean {
  if (!(newestDate && DATE.test(newestDate))) {
    return false;
  }
  if (!(stored && DATE.test(stored))) {
    return true;
  }
  return newestDate > stored;
}

const storageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

export function readLastSeen(userId: string): string | null {
  try {
    return globalThis.localStorage?.getItem(storageKey(userId)) ?? null;
  } catch {
    return null;
  }
}

export function writeLastSeen(userId: string, date: string): void {
  try {
    globalThis.localStorage?.setItem(storageKey(userId), date);
  } catch {
    // Storage can be unavailable or full; the marker is only a convenience.
  }
}
