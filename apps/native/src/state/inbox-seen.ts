import { useCallback, useEffect } from "react";
import { useMMKVString } from "react-native-mmkv";

/**
 * When the signed-in reader last looked at their inbox.
 *
 * Per user: a shared device shows one account's notifications as read only
 * for that account.
 *
 * The first time a user is seen there is no stored value. Treating that as
 * "never looked" would count every notification they ever received, so the
 * first launch after this ships would put a 9+ badge on every existing
 * reader's bell. Instead the clock starts now: history reads as seen, and
 * only what arrives afterwards counts as unread. `ready` stays false until
 * that first value is stored, so callers don't query with no cutoff.
 */
export function useInboxSeen(userId: string | null | undefined) {
  const [lastSeenAt, setLastSeenAt] = useMMKVString(
    `inbox:lastSeenAt:${userId ?? "signed-out"}`
  );

  useEffect(() => {
    if (userId && lastSeenAt === undefined) {
      setLastSeenAt(new Date().toISOString());
    }
  }, [userId, lastSeenAt, setLastSeenAt]);

  const markSeen = useCallback(() => {
    setLastSeenAt(new Date().toISOString());
  }, [setLastSeenAt]);

  return {
    lastSeenAt: lastSeenAt ?? null,
    ready: lastSeenAt !== undefined,
    markSeen,
  };
}
