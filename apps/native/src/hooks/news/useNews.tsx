import { isDefinedError } from "@orpc/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc, type RouterOutputs } from "#/lib/orpc";
import { findCachedNews } from "./findCachedNews";

export default function useNews(slug: string) {
  const queryClient = useQueryClient();

  const lookupCachedNews = () =>
    findCachedNews(
      queryClient.getQueryCache().findAll({ queryKey: orpc.news.key() }),
      slug
    );

  return useQuery(
    orpc.news.one.queryOptions({
      input: {
        slug,
        type: "article",
      },
      retry: (failureCount, error) => {
        if (isDefinedError(error) && error?.code === "NOT_FOUND") {
          return false;
        }
        return failureCount < 3;
      },
      initialData: () =>
        lookupCachedNews()?.item as RouterOutputs["news"]["one"] | undefined,
      initialDataUpdatedAt: () => lookupCachedNews()?.dataUpdatedAt,
    })
  );
}
