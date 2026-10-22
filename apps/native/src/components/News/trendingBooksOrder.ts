import type { PartnerContent } from "@news-spend-media/payload/types";

/**
 * Trending Books is an ad surface: books and other partner ads share the row,
 * so alternate them instead of showing whatever order the batch arrived in.
 * Books lead; whichever side runs out leaves the rest of the other in place.
 */
export function alternateBooksAndAds(
  items: PartnerContent[]
): PartnerContent[] {
  const books = items.filter((item) => item.type === "book");
  const ads = items.filter((item) => item.type !== "book");
  const alternating: PartnerContent[] = [];

  for (let i = 0; i < Math.max(books.length, ads.length); i++) {
    const book = books[i];
    const ad = ads[i];
    if (book) {
      alternating.push(book);
    }
    if (ad) {
      alternating.push(ad);
    }
  }

  return alternating;
}
