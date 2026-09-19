import { orpc } from "#/lib/orpc";

/**
 * The exact input builders behind the two feed queries (Latest.tsx and
 * useAllNews.ts), shared so cache lookups elsewhere can't drift from them.
 *
 * oRPC builds an infinite query's cache key by *evaluating* the input
 * function, so every field present at fetch time is part of the key. That
 * bit us when `forceRefresh` joined the feed inputs: the detail screen's
 * `initialData` lookup (useNews) and the pagination reset (Latest) still
 * built keys without it, hashed differently, and silently missed — no
 * instant image/title on open, and a reset that reset nothing. If a field
 * is added here, every consumer of these helpers follows automatically.
 *
 * `forceRefresh` is always `false` in a key: the live queries read it from
 * a ref at request time, and `refetch()` reuses the existing key rather
 * than building a new one, so a key is only ever stored with `false`.
 */
export const homeFeedInput = (
  pageParam: number | undefined,
  forceRefresh: boolean
) => ({
  limit: 10,
  page: pageParam,
  forceRefresh,
});

export const allFeedInput = (
  pageParam: number | undefined,
  args: {
    category: string | undefined;
    type?: "article" | "video";
    includeAds: boolean;
    forceRefresh: boolean;
  }
) => ({
  category: args.category,
  type: args.type,
  limit: 10,
  includeAds: args.includeAds,
  page: pageParam,
  forceRefresh: args.forceRefresh,
});

/** Key under which the Latest feed's pages are cached. */
export const homeFeedInfiniteKey = () =>
  orpc.news.home.infiniteKey({
    input: (pageParam: number | undefined) => homeFeedInput(pageParam, false),
    initialPageParam: undefined,
  });

/** Key under which a category feed's pages are cached. */
export const categoryFeedInfiniteKey = (
  category: string | undefined,
  includeAds: boolean
) =>
  orpc.news.all.infiniteKey({
    input: (pageParam: number | undefined) =>
      allFeedInput(pageParam, {
        category,
        type: undefined,
        includeAds,
        forceRefresh: false,
      }),
    initialPageParam: undefined,
  });
