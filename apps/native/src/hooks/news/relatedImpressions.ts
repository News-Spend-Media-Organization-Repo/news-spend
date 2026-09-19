/**
 * Width of a card in the "People are also reading" row, as a share of the
 * window, and the gap after it (`mr-2.5`). Shared so the layout and the
 * impression count cannot disagree about how many cards are on screen.
 */
export const RELATED_ITEM_WIDTH_RATIO = 0.42;
export const RELATED_ITEM_GAP = 10;

type RelatedRowItem = {
  id?: string;
  slug?: string | null;
  type?: string | null;
};

/**
 * How many cards are in view when the row first scrolls on screen: those that
 * fit completely. The next one shows only as a sliver, well under the 50%
 * an impression needs.
 */
export function relatedCardsVisibleOnArrival(windowWidth: number): number {
  const card = windowWidth * RELATED_ITEM_WIDTH_RATIO + RELATED_ITEM_GAP;
  return Math.max(1, Math.floor(windowWidth / card));
}

/**
 * The articles to record as seen when the related row itself becomes viewable.
 *
 * The row is counted from the feed's callback, not its own. It is a horizontal
 * list nested in the vertical feed, so its own viewport is its width alone: it
 * would call its cards "visible" the moment it mounted, which happens before
 * the reader has scrolled to it. Cards revealed by swiping sideways are not
 * counted, which under-reports rather than invents.
 *
 * Reward tasks and partner content share the row but are not articles, and the
 * server has no article to attach them to.
 */
export function relatedArticlesSeenOnArrival(
  data: RelatedRowItem[] | undefined,
  windowWidth: number
): { id: string; slug: string | null | undefined; position: number }[] {
  const seen: {
    id: string;
    slug: string | null | undefined;
    position: number;
  }[] = [];
  const limit = relatedCardsVisibleOnArrival(windowWidth);

  for (const [position, card] of (data ?? []).slice(0, limit).entries()) {
    if (card.id && (card.type === "article" || card.type === "video")) {
      seen.push({ id: card.id, slug: card.slug, position });
    }
  }
  return seen;
}
