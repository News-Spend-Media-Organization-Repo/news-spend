import { alternateBooksAndAds } from "../trendingBooksOrder";

const book = (id: string) => ({ id, type: "book" }) as never;
const ad = (id: string) => ({ id, type: "app" }) as never;

describe("alternateBooksAndAds", () => {
  it("alternates book, ad, book, ad regardless of input order", () => {
    const ordered = alternateBooksAndAds([
      ad("a1"),
      book("b1"),
      ad("a2"),
      book("b2"),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(["b1", "a1", "b2", "a2"]);
  });

  it("keeps the remaining books when the ads run out", () => {
    const ordered = alternateBooksAndAds([book("b1"), book("b2"), ad("a1")]);

    expect(ordered.map((item) => item.id)).toEqual(["b1", "a1", "b2"]);
  });

  it("leaves a books-only batch untouched", () => {
    const ordered = alternateBooksAndAds([book("b1"), book("b2")]);

    expect(ordered.map((item) => item.id)).toEqual(["b1", "b2"]);
  });
});
