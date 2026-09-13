import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import { orpc } from "#/lib/orpc";

export type CommentSort = "recent" | "top";

export default function useGetComments(
  newsId: string,
  _isRepliesScreen: boolean,
  sort: CommentSort = "recent"
) {
  return useInfiniteQuery(
    orpc.comments.all.infiniteOptions({
      input: (pageParam: number | undefined) => ({
        newsId,
        page: pageParam,
        sort,
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      staleTime: 0,
      enabled: !!newsId,
      /*
       * Switching sort starts a fresh query with no cache, which emptied the
       * list mid-tap and flashed the "nothing here yet" state over a story
       * that plainly has comments. Holding the previous page keeps the list
       * on screen until the reordered one lands.
       */
      placeholderData: keepPreviousData,
    })
  );
}
