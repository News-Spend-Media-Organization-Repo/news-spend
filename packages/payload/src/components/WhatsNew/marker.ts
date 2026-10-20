const STORAGE_PREFIX = "whats-new:last-seen:";
const DATE = /^\d{4}-\d\d-\d\d$/;

/** Fired on the window after RecordVisit writes the last-seen date. */
export const LAST_SEEN_EVENT = "whats-new:last-seen";

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

/** Whether the dot should be visible for this member right now. */
export function shouldShowMarker(newestDate: string, userId: string): boolean {
  return isNewestUnread(newestDate, readLastSeen(userId));
}

const defaultTarget = (): EventTarget => globalThis as unknown as EventTarget;

export function writeLastSeen(
  userId: string,
  date: string,
  target: EventTarget = defaultTarget()
): void {
  try {
    globalThis.localStorage?.setItem(storageKey(userId), date);
  } catch {
    // Storage can be unavailable or full; the marker is only a convenience.
  }

  try {
    target.dispatchEvent(
      new CustomEvent(LAST_SEEN_EVENT, { detail: { userId, date } })
    );
  } catch {
    // An environment without events still has a working page.
  }
}

/**
 * Calls `listener` when this tab writes the last-seen date, or when another
 * tab does (the browser's `storage` event). Returns the cleanup function.
 */
export function subscribeLastSeen(
  listener: () => void,
  target: EventTarget = defaultTarget()
): () => void {
  const handler = () => listener();
  target.addEventListener(LAST_SEEN_EVENT, handler);
  target.addEventListener("storage", handler);

  return () => {
    target.removeEventListener(LAST_SEEN_EVENT, handler);
    target.removeEventListener("storage", handler);
  };
}
