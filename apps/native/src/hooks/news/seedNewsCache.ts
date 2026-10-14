import type { News } from "@news-spend-media/payload/types";

import { orpc, type RouterOutputs } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";

/**
 * Puts a list item into the single-article cache before opening it, so the
 * article screen paints the title, image and author straight away instead of
 * an empty skeleton while `news.one` loads.
 *
 * `useNews` only seeds itself from the latest and category feeds. A carousel
 * item is in neither, so it needs seeding by whoever opens it.
 *
 * `updatedAt: 0` marks the entry stale, so the query still refetches the full
 * article (body, key points, reactions). An entry that is already cached is
 * left alone: it is at least as complete as a list item.
 */
export function seedNewsCache(item: News) {
  const queryKey = orpc.news.one.queryKey({
    input: { slug: item.slug, type: "article" },
  });

  if (queryClient.getQueryData(queryKey) !== undefined) {
    return;
  }

  queryClient.setQueryData(queryKey, item as RouterOutputs["news"]["one"], {
    updatedAt: 0,
  });
}
