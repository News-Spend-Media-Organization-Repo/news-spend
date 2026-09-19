import type { Category, NewsCategory } from "@news-spend-media/payload/types";
import { isInferableError } from "@orpc/client";
import { useRoute } from "@react-navigation/native";
import {
  type InfiniteData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { orpc, type RouterOutputs } from "#/lib/orpc";
import { routeState } from "#/state/route-state";
import { storage } from "#/utils/storage";
import { categoryFeedInfiniteKey, homeFeedInfiniteKey } from "./feedKeys";

export default function useNews(slug: string, type?: "article" | "video") {
  const route = useRoute();
  const queryClient = useQueryClient();

  return useQuery(
    orpc.news.one.queryOptions({
      input: {
        slug,
        type: type ?? "article",
      },
      retry: (failureCount, error) => {
        if (isInferableError(error) && error?.code === "NOT_FOUND") {
          return false;
        }
        return failureCount < 3;
      },
      initialData: () => {
        if (route.name === "News") {
          if (routeState.tabName === "latest") {
            // TODO: change limit to constant
            const data = queryClient
              .getQueryData(homeFeedInfiniteKey())
              ?.pages.flatMap((page) => page.docs);

            const news = data?.find((newsItem) => newsItem.slug === slug);

            return news;
          }
          const categories = JSON.parse(
            storage.getString("CATEGORIES") ?? "[]"
          ) as NewsCategory["items"];
          const category = categories?.find(
            ({ category }) => (category as Category).id === routeState.tabName
          );
          const allNews = queryClient
            .getQueryData<InfiniteData<RouterOutputs["news"]["all"]>>(
              categoryFeedInfiniteKey(
                (category?.category as unknown as Category)?.id,
                true
              )
            )
            ?.pages.flatMap((page) => page.docs);

          return allNews?.find((news) => news.slug === slug);
        }
      },
      initialDataUpdatedAt: () => {
        if (route.name === "News") {
          if (routeState.tabName === "latest") {
            return queryClient.getQueryState(homeFeedInfiniteKey())
              ?.dataUpdatedAt;
          }
          const categories = JSON.parse(
            storage.getString("CATEGORIES") ?? "[]"
          ) as NewsCategory["items"];
          const category = categories?.find(
            ({ category }) => (category as Category).id === routeState.tabName
          );

          return queryClient.getQueryState(
            categoryFeedInfiniteKey(
              (category?.category as unknown as Category)?.id,
              true
            )
          )?.dataUpdatedAt;
        }
      },
    })
  );
}
