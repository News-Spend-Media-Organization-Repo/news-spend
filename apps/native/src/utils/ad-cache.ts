import type { NativeAd } from "react-native-google-mobile-ads";

const AD_TTL_MS = 60 * 60 * 1000;

type CacheEntry = {
  ad: NativeAd;
  cachedAt: number;
};

const cache = new Map<string, CacheEntry>();

const makeKey = (tab: string | undefined, id: string) =>
  `${tab ?? "default"}:${id}`;

export const getCachedAd = (
  tab: string | undefined,
  id: string
): NativeAd | null => {
  const entry = cache.get(makeKey(tab, id));
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.cachedAt > AD_TTL_MS) {
    cache.delete(makeKey(tab, id));
    return null;
  }
  return entry.ad;
};

export const setCachedAd = (
  tab: string | undefined,
  id: string,
  ad: NativeAd
) => {
  cache.set(makeKey(tab, id), { ad, cachedAt: Date.now() });
};

export const clearTabAdCache = (tab: string) => {
  for (const key of cache.keys()) {
    if (key.startsWith(`${tab}:`)) {
      cache.delete(key);
    }
  }
};
