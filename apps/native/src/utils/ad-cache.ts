import type { NativeAd } from "react-native-google-mobile-ads";

const AD_TTL_MS = 60 * 60 * 1000;

type CacheEntry = {
  ad: NativeAd;
  cachedAt: number;
  /** Still on screen, but a fresher ad has been asked for. */
  stale: boolean;
};

const cache = new Map<string, CacheEntry>();

/**
 * Slot ids the feed hands out are random: the server mints a new one for every
 * ad each time it composes the feed. Keying the cache by them meant every
 * rebuild of the feed (coming back from an article after the server's cache
 * lapsed, a tab switch, a refresh) orphaned every loaded ad and sent each slot
 * back to the "Advertisement" placeholder to load again.
 *
 * What stays the same across a rebuild is the order: the n-th ad slot is the
 * n-th ad slot. The feed registers its ids in order here, and the cache is
 * keyed by that ordinal, so a rebuilt feed finds the ads it already has.
 */
const ordinals = new Map<string, Map<string, number>>();

export const registerAdSlots = (tab: string | undefined, ids: string[]) => {
  const tabKey = tab ?? "default";
  const next = new Map<string, number>();
  ids.forEach((id, index) => {
    next.set(id, index);
  });
  ordinals.set(tabKey, next);
};

export const makeKey = (tab: string | undefined, id: string) => {
  const tabKey = tab ?? "default";
  const ordinal = ordinals.get(tabKey)?.get(id);
  return ordinal === undefined
    ? `${tabKey}:${id}`
    : `${tabKey}:slot-${ordinal}`;
};

/**
 * Release a cached ad's native resources.
 *
 * A NativeAd holds a reference on the native side that outlives the JS
 * object, so dropping an entry from this Map is not enough on its own —
 * evicted and cleared ads used to leak. `destroy` is best-effort: an ad that
 * has already been torn down natively throws rather than no-oping.
 */
const releaseAd = (ad: NativeAd) => {
  try {
    ad.destroy();
  } catch {
    // Already destroyed, or the native view is gone. Nothing to release.
  }
};

export const getCachedAd = (
  tab: string | undefined,
  id: string
): NativeAd | null => {
  const key = makeKey(tab, id);
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.cachedAt > AD_TTL_MS) {
    cache.delete(key);
    releaseAd(entry.ad);
    return null;
  }
  return entry.ad;
};

export const setCachedAd = (
  tab: string | undefined,
  id: string,
  ad: NativeAd
) => {
  const key = makeKey(tab, id);
  // Replacing an entry orphans whatever it held.
  const previous = cache.get(key);
  if (previous && previous.ad !== ad) {
    // Not at once: the row may still be painting it until it re-renders with
    // the new one.
    setTimeout(() => releaseAd(previous.ad), 1000);
  }
  cache.set(key, { ad, cachedAt: Date.now(), stale: false });
};

/**
 * Whether the ad held for this slot is on its way out: kept on screen so the
 * slot is never empty, but a replacement has been asked for.
 */
export const isCachedAdStale = (tab: string | undefined, id: string) =>
  cache.get(makeKey(tab, id))?.stale ?? false;

/**
 * A refresh wants new ads, not blank slots. Marks every ad in the tab stale
 * instead of destroying it, so each keeps showing until its replacement
 * arrives and then swaps in place.
 */
export const markTabAdsStale = (tab: string) => {
  for (const [key, entry] of cache) {
    if (key.startsWith(`${tab}:`)) {
      entry.stale = true;
    }
  }
};

export const clearTabAdCache = (tab: string) => {
  for (const [key, entry] of cache) {
    if (key.startsWith(`${tab}:`)) {
      cache.delete(key);
      releaseAd(entry.ad);
    }
  }
};

/**
 * What makes two ads "the same ad" to a person scrolling: the same advertiser
 * saying the same thing. Creative ids aren't exposed, so this is the closest
 * stable fingerprint.
 */
export const adSignature = (ad: NativeAd) =>
  `${ad.advertiser ?? ""}|${ad.headline ?? ""}`.toLowerCase();

/**
 * Whether another slot in this tab already holds an ad with this fingerprint.
 *
 * Every slot asks Google for an ad from one ad unit, and requests made close
 * together tend to come back with the same creative. Without a check the feed
 * shows that one ad down the whole list.
 */
export const isDuplicateInTab = (
  tab: string | undefined,
  id: string,
  ad: NativeAd
): boolean => {
  const prefix = `${tab ?? "default"}:`;
  const own = makeKey(tab, id);
  const signature = adSignature(ad);
  for (const [key, entry] of cache) {
    if (
      key !== own &&
      key.startsWith(prefix) &&
      entry.ad !== ad &&
      adSignature(entry.ad) === signature
    ) {
      return true;
    }
  }
  return false;
};
