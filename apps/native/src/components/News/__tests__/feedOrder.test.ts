import { dropTrendingAndAdjacentAds } from "../categories/feedOrder";

const article = (id: string) => ({ id, type: "article" });
const ad = (id: string) => ({ _type: "ad", type: "inHouse", id });
const promo = (id: string) => ({ _type: "promotionMedia", id });

describe("dropTrendingAndAdjacentAds", () => {
  it("removes stories already shown in the carousel", () => {
    const rows = [article("a"), article("b")];

    expect(dropTrendingAndAdjacentAds(rows, new Set(["a"]))).toEqual([
      article("b"),
    ]);
  });

  it("drops the ad that removal pushed against another ad", () => {
    const rows = [ad("ad-1"), article("a"), ad("ad-2"), article("b")];

    expect(dropTrendingAndAdjacentAds(rows, new Set(["a"]))).toEqual([
      ad("ad-1"),
      article("b"),
    ]);
  });

  it("keeps an ad that still follows a story", () => {
    const rows = [article("a"), ad("ad-1")];

    expect(dropTrendingAndAdjacentAds(rows, new Set())).toEqual(rows);
  });

  it("treats a promo carousel as an ad", () => {
    const rows = [promo("promo-1"), ad("ad-1")];

    expect(dropTrendingAndAdjacentAds(rows, new Set())).toEqual([
      promo("promo-1"),
    ]);
  });

  it("ignores empty rows", () => {
    const rows = [null, article("a")];

    expect(dropTrendingAndAdjacentAds(rows, new Set())).toEqual([article("a")]);
  });
});
