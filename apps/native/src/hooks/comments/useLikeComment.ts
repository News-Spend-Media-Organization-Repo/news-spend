import { isDefinedError } from "@orpc/client";
import { useRoute } from "@react-navigation/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc, type RouterOutputs } from "#/lib/orpc";
import { authState } from "#/state/auth";
import type { HomeTabRouteProps } from "#/types";

type Comment = RouterOutputs["comments"]["one"];
type InfiniteComments = RouterOutputs["comments"]["all"];

function useLikeComment(newsId: string, parentId?: string) {
  const queryClient = useQueryClient();
  const route = useRoute<HomeTabRouteProps<"Comment" | "CommentReply">>();
  const type = route.name.startsWith("Live") ? "video" : "article";
  const commentId = route.params?.commentId;

  return useMutation(
    orpc.comments.like.mutationOptions({
      // Optimistic update
      onMutate: async (targetCommentId: string) => {
        // Cancel relevant queries
        await queryClient.cancelQueries({
          queryKey: orpc.comments.one.queryOptions({ input: targetCommentId }).queryKey,
        });
        await queryClient.cancelQueries({
          queryKey: orpc.comments.all.key(),
        });

        // Snapshot previous data
        const previousComment = queryClient.getQueryData<Comment>(
          orpc.comments.one.queryOptions({ input: targetCommentId }).queryKey,
        );

        const previousComments = queryClient.getQueryData(
          orpc.comments.all.infiniteKey({
            input: (pageParam: number | undefined) => ({
              newsId,
              parentId,
              page: pageParam,
            }),
            initialPageParam: undefined,
          }),
        );

        const userId = authState.user?.id;

        // Helper to update likes array
        const updateLikes = (currentLikes: Comment["likes"] = [], shouldRemove: boolean) => {
          if (!userId) {
            return currentLikes;
          }
          return shouldRemove
            ? currentLikes?.filter((user) =>
                typeof user === "string" ? user !== userId : user?.id !== userId,
              )
            : [...currentLikes, authState.user]; // Add the full authState.user object
        };

        // Optimistically update single comment
        if (previousComment && userId) {
          // Ensure userId exists before attempting optimistic update
          const hasLikedPrev = previousComment.likes?.some((user) =>
            typeof user === "string" ? user === userId : user?.id === userId,
          );

          const newLikes = updateLikes(previousComment.likes ?? [], hasLikedPrev ?? false);
          const newUserReaction = newLikes?.some((user) =>
            typeof user === "string" ? user === userId : user?.id === userId,
          )
            ? "like"
            : "none";

          queryClient.setQueryData(orpc.comments.one.queryKey({ input: targetCommentId }), {
            ...previousComment,
            likes: newLikes,
            userReaction: newUserReaction,
          });
        }

        // Optimistically update infinite comments (list or replies)
        if (previousComments?.pages && userId) {
          // Ensure userId exists
          const newPages = previousComments.pages.map((page) => ({
            ...page,
            docs: page.docs.map((comment) => {
              if (comment.id === targetCommentId) {
                const hasLikedPrev = comment.likes?.some((user) =>
                  typeof user === "string" ? user === userId : user?.id === userId,
                );

                const newLikes = updateLikes(comment.likes ?? [], hasLikedPrev ?? false);
                const newUserReaction = newLikes?.some((user) =>
                  typeof user === "string" ? user === userId : user?.id === userId,
                )
                  ? "like"
                  : "none";

                return {
                  ...comment,
                  likes: newLikes,
                  userReaction: newUserReaction,
                };
              }
              return comment;
            }),
          }));

          queryClient.setQueryData(
            orpc.comments.all.infiniteKey({
              input: (pageParam: number | undefined) => ({
                newsId,
                parentId,
                page: pageParam,
              }),
              initialPageParam: undefined,
            }),
            { ...previousComments, pages: newPages },
          );
        }

        return { previousComment, previousComments };
      },

      // Rollback on error
      onError: (error, variable, context) => {
        if (isDefinedError(error)) {
          // Rollback single comment
          if (context?.previousComment) {
            queryClient.setQueryData(
              orpc.comments.one.queryKey({ input: variable }),
              context.previousComment,
            );
          }
          // Rollback infinite comments
          if (context?.previousComments) {
            queryClient.setQueryData(
              orpc.comments.all.infiniteKey({
                input: (pageParam) => ({ newsId, parentId, page: pageParam }),
                initialPageParam: undefined,
              }),
              context.previousComments,
            );
          }
        }
      },

      // Dehydrate: trust the server response. onMutate already painted
      // the optimistic state; onSuccess just replaces it with the
      // authoritative server state. We derive `userReaction` from the
      // server's `likes` array to keep the cache field consistent
      // (the server response is a raw Payload doc and doesn't include
      // this derived field).
      onSuccess: (serverResponse, targetCommentId) => {
        const userId = authState.user?.id;
        const userReaction =
          userId &&
          serverResponse.likes?.some((u: string | { id?: string }) =>
            typeof u === "string" ? u === userId : u?.id === userId,
          )
            ? ("like" as const)
            : ("none" as const);

        const enriched = { ...serverResponse, userReaction };

        const singleKey = orpc.comments.one.queryKey({
          input: targetCommentId,
        });
        if (queryClient.getQueryData(singleKey)) {
          queryClient.setQueryData(singleKey, enriched);
        }

        const infiniteKey = orpc.comments.all.infiniteKey({
          input: (pageParam: number | undefined) => ({
            newsId,
            parentId,
            page: pageParam,
          }),
          initialPageParam: undefined,
        });
        const currentInfinite = queryClient.getQueryData(infiniteKey);
        if (currentInfinite?.pages) {
          const newPages = currentInfinite.pages.map((page: { docs: Comment[] }) => ({
            ...page,
            docs: page.docs.map((comment) => (comment.id === targetCommentId ? enriched : comment)),
          }));
          queryClient.setQueryData(infiniteKey, {
            ...currentInfinite,
            pages: newPages,
          });
        }
      },
    }),
  );
}

export default useLikeComment;
