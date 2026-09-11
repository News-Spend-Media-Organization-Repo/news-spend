import { useInfiniteQuery } from "@tanstack/react-query";

import { orpc } from "#/lib/orpc";
import { NEWS_FEED_STALE_TIME_MS } from "./constants";

export default function useAllNews({
  category,
  type,
  ad = false,
}: {
  category?: string;
  type?: "article" | "video";
  ad?: boolean;
}) {
  return useInfiniteQuery(
    orpc.news.all.infiniteOptions({
      input: (pageParam: number | undefined) => ({
        category,
        type,
        limit: 10,
        includeAds: ad,
        page: pageParam,
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      staleTime: NEWS_FEED_STALE_TIME_MS,
    })
  );
}
