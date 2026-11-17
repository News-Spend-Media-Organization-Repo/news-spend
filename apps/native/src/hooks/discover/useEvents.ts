import { useInfiniteQuery } from "@tanstack/react-query";
import { client, orpc } from "#/lib/orpc";

const PAGE_SIZE = 20;

/**
 * Events, refreshing a page at a time.
 *
 * The server drops non-naira rows after Shows has paginated, so a page can come
 * back empty while a cursor still points at more. Keep asking until there is
 * something to show or the cursor runs out.
 */
export function useEvents() {
  const options = orpc.events.list.infiniteOptions({
    input: (cursor: string | undefined) => ({
      limit: PAGE_SIZE,
      cursor,
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  return useInfiniteQuery({
    ...options,
    queryFn: async ({ pageParam, signal }) => {
      let cursor = pageParam;

      for (;;) {
        const page = await client.events.list(
          { limit: PAGE_SIZE, cursor },
          { signal }
        );
        if (page.data.length > 0 || !page.nextCursor) {
          return page;
        }
        cursor = page.nextCursor;
      }
    },
  });
}
