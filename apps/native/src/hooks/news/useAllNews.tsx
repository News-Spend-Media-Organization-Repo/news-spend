import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { orpc } from "#/lib/orpc";
import { NEWS_FEED_STALE_TIME_MS } from "./constants";
import { allFeedInput } from "./feedKeys";

export default function useAllNews({
  category,
  type,
  ad = false,
}: {
  category?: string;
  type?: "article" | "video";
  ad?: boolean;
}) {
  // Read at request time by the `input` builder below, so only the specific
  // fetch triggered by `refetchFresh` carries it — passive refetches (tab
  // switch, app foreground, article-back) still hit the server's 90s
  // composed-feed cache instead of forcing a fresh ad on every return.
  const forceRefreshRef = useRef(false);

  const query = useInfiniteQuery(
    orpc.news.all.infiniteOptions({
      input: (pageParam: number | undefined) =>
        allFeedInput(pageParam, {
          category,
          type,
          includeAds: ad,
          forceRefresh: forceRefreshRef.current,
        }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      staleTime: NEWS_FEED_STALE_TIME_MS,
    })
  );

  const { refetch } = query;
  const refetchFresh = useCallback(async () => {
    forceRefreshRef.current = true;
    try {
      await refetch();
    } finally {
      forceRefreshRef.current = false;
    }
  }, [refetch]);

  return { ...query, refetchFresh };
}
