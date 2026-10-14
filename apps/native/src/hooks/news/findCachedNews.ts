type CachedQuery = {
  state: { data: unknown; dataUpdatedAt: number };
};

type CachedNewsMatch = {
  item: Record<string, unknown>;
  dataUpdatedAt: number;
};

/**
 * Fields whose subtrees are never an article list: the lexical body and key
 * points are large and can only contain blocks, not feed items.
 */
const SKIPPED_KEYS = new Set(["content", "keyPoints"]);
const MAX_DEPTH = 6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function collect(
  value: unknown,
  slug: string,
  depth: number,
  out: Record<string, unknown>[]
) {
  if (depth > MAX_DEPTH) {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collect(entry, slug, depth + 1, out);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (value.slug === slug && typeof value.title === "string") {
    out.push(value);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (!SKIPPED_KEYS.has(key)) {
      collect(child, slug, depth + 1, out);
    }
  }
}

/**
 * Finds an article in whatever list queries are already cached (the Latest
 * and category feeds, the trending carousel, related news...), so opening it
 * can paint straight away instead of waiting for `news.one`.
 *
 * It walks the cached data rather than rebuilding each list's query key. A key
 * built by hand drifts when a feed's input changes and then misses without any
 * error, which is what used to leave the article screen empty. The freshest
 * match wins.
 */
export function findCachedNews(
  queries: CachedQuery[],
  slug: string
): CachedNewsMatch | undefined {
  let best: CachedNewsMatch | undefined;

  for (const query of queries) {
    const found: Record<string, unknown>[] = [];
    collect(query.state.data, slug, 0, found);

    const item = found[0];
    if (item && (!best || query.state.dataUpdatedAt > best.dataUpdatedAt)) {
      best = { item, dataUpdatedAt: query.state.dataUpdatedAt };
    }
  }

  return best;
}
