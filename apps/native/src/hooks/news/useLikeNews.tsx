import { useRoute } from "@react-navigation/native";
import { useMutation } from "@tanstack/react-query";

import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import type { HomeTabRouteProps, LiveTabRouteProps } from "#/types";

export default function useLikeNews() {
  const route = useRoute<
    HomeTabRouteProps<"News"> | LiveTabRouteProps<"LiveHome">
  >();
  const type = route.name === "News" ? "article" : "video";

  return useMutation(
    orpc.news.like.mutationOptions({
      onMutate: async (data) => {
        // Cancel any outgoing refetches
        // (so they don't overwrite our optimistic update)
        queryClient.cancelQueries({
          queryKey: orpc.news.one.key({ input: { slug: data.slug, type } }),
        });

        // Snapshot the previous value
        const prevNews = queryClient.getQueryData(
          orpc.news.one.queryKey({ input: { slug: data.slug, type } })
        );

        const hasLiked = prevNews?.userReaction === "like";
        const hasDisliked = prevNews?.userReaction === "dislike";

        let newLikesCount = prevNews?.likesCount ?? 0;
        let newDislikesCount = prevNews?.dislikesCount ?? 0;
        let newUserReaction: typeof prevNews.userReaction =
          prevNews?.userReaction ?? "none";

        if (hasLiked) {
          // User is unliking
          newLikesCount = Math.max(0, newLikesCount - 1);
          newUserReaction = "none";
        } else if (hasDisliked) {
          // User previously disliked, now liking
          newLikesCount = newLikesCount + 1;
          newDislikesCount = Math.max(0, newDislikesCount - 1);
          newUserReaction = "like";
        } else {
          // User had no reaction, now liking
          newLikesCount = newLikesCount + 1;
          newUserReaction = "like";
        }

        const optimisticNews = {
          ...prevNews,
          userReaction: newUserReaction,
          likesCount: newLikesCount,
          dislikesCount: newDislikesCount,
        };

        queryClient.setQueryData(
          orpc.news.one.queryKey({ input: { slug: data.slug, type } }),
          optimisticNews
        );

        return { prevNews, optimisticNews };
      },
      // If the mutation fails, use the context we returned above
      onError: (_err, variables, context) => {
        queryClient.setQueryData(
          orpc.news.one.queryKey({ input: { slug: variables?.slug, type } }),
          context?.prevNews
        );
        // utils.news.one.invalidate(news?.slug.current);
      },
      // Always refetch after error or success:
      onSuccess: (news, variables, ctx) => {
        queryClient.invalidateQueries({
          queryKey: orpc.news.one.queryKey({
            input: { slug: variables.slug, type },
          }),
        });
      },
    })
  );
}
