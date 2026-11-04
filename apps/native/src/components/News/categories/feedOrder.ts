type FeedRow = { id?: string; _type?: string; type?: string };

const isAd = (row: FeedRow | undefined) =>
  row?._type === "ad" || row?._type === "promotionMedia";

/**
 * Removes the stories already shown in the trending carousel, then any ad that
 * the removal pushed next to another ad. The server spaced its slots around
 * rows that are no longer there, so without this the feed opens on a run of
 * ads.
 */
export function dropTrendingAndAdjacentAds<T>(
  rows: T[],
  trendingIds: Set<string>
): T[] {
  const kept: T[] = [];
  for (const row of rows) {
    const value = row as FeedRow | null | undefined;
    if (!value) {
      continue;
    }
    const isTrending =
      (value.type === "article" || value.type === "video") &&
      value.id !== undefined &&
      trendingIds.has(value.id);
    if (isTrending) {
      continue;
    }
    if (isAd(value) && isAd(kept.at(-1) as FeedRow | undefined)) {
      continue;
    }
    kept.push(row);
  }
  return kept;
}
