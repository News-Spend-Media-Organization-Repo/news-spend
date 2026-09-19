import {
  relatedArticlesSeenOnArrival,
  relatedCardsVisibleOnArrival,
} from "../relatedImpressions";

const article = (id: string) => ({ id, slug: `${id}-slug`, type: "article" });

describe("relatedCardsVisibleOnArrival", () => {
  it.each([
    [320, 2],
    [390, 2],
    [430, 2],
    [768, 2],
  ])("counts the cards that fit fully on a %ipt-wide screen", (width, expected) => {
    expect(relatedCardsVisibleOnArrival(width)).toBe(expected);
  });

  it("never reports fewer than one", () => {
    expect(relatedCardsVisibleOnArrival(50)).toBe(1);
  });
});

describe("relatedArticlesSeenOnArrival", () => {
  it("records only the cards in view when the row arrives, in order", () => {
    const data = [article("a"), article("b"), article("c"), article("d")];

    expect(relatedArticlesSeenOnArrival(data, 390)).toEqual([
      { id: "a", slug: "a-slug", position: 0 },
      { id: "b", slug: "b-slug", position: 1 },
    ]);
  });

  it("skips reward tasks and partner content, keeping the other cards' positions", () => {
    const data = [{ id: "task", type: undefined }, article("b"), article("c")];

    expect(relatedArticlesSeenOnArrival(data, 390)).toEqual([
      { id: "b", slug: "b-slug", position: 1 },
    ]);
  });

  it("returns nothing for an empty or missing row", () => {
    expect(relatedArticlesSeenOnArrival([], 390)).toEqual([]);
    expect(relatedArticlesSeenOnArrival(undefined, 390)).toEqual([]);
  });
});
