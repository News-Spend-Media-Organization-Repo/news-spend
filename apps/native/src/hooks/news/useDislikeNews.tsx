import { useRoute } from "@react-navigation/native";
import { useMutation } from "@tanstack/react-query";

import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import type { HomeTabRouteProps, LiveTabRouteProps } from "#/types";

export default function useDislikeNews() {
  const route = useRoute<
    HomeTabRouteProps<"News"> | LiveTabRouteProps<"LiveHome">
  >();
  const type = route.name === "News" ? "article" : "video";

  return useMutation(
    orpc.news.dislike.mutationOptions({
      onMutate: async (data) => {
        // Cancel any outgoing refetch
        // (so they don't overwrite our optimistic update)
        queryClient.cancelQueries({
          queryKey: orpc.news.one.queryKey({
            input: { slug: data.slug, type },
          }),
        });

        // Snapshot the previous value
        const prevNews = queryClient.getQueryData(
          orpc.news.one.queryKey({ input: { slug: data.slug, type } })
        );

        let newLikesCount = prevNews?.likesCount ?? 0;
        let newDislikesCount = prevNews?.dislikesCount ?? 0;
        let newUserReaction: typeof prevNews.userReaction =
          prevNews?.userReaction ?? "none";

        if (newUserReaction === "dislike") {
          // User is un-disliking
          newUserReaction = "none";
          newDislikesCount = Math.max(0, newDislikesCount - 1);
        } else if (newUserReaction === "like") {
          // User previously liked, now disliking
          newUserReaction = "dislike";
          newDislikesCount = newDislikesCount + 1;
          newLikesCount = Math.max(0, newLikesCount - 1);
        } else {
          // newUserReaction === "none"
          // User had no reaction, now disliking
          newUserReaction = "dislike";
          newDislikesCount = newDislikesCount + 1;
        }

        const optimisticNews = {
          ...prevNews,
          userReaction: newUserReaction,
          dislikesCount: newDislikesCount,
          likesCount: newLikesCount,
        };

        queryClient.setQueryData(
          orpc.news.one.queryKey({ input: { slug: data.slug, type } }),
          optimisticNews
        );

        return { prevNews, optimisticNews };
      },
      // If the mutation fails, use the context we returned above
      onError: (_err, news, context) => {
        queryClient.setQueryData(
          orpc.news.one.queryKey({ input: { slug: news.slug, type } }),
          context?.prevNews
        );
      },
      // Always refetch after error or success:
      onSettled: (_news, _error, variables) => {
        queryClient.invalidateQueries({
          queryKey: orpc.news.one.queryKey({
            input: { slug: variables.slug || "", type },
          }),
        });
      },
    })
  );
}
