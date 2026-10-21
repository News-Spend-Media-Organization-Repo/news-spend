import { RATINGS, ratingContent } from "../ratingContent";

describe("ratingContent", () => {
  it.each([
    [1, "We'd like to do better.", "Thanks for sharing your feedback.", "sad"],
    [
      2,
      "Thanks for letting us know.",
      "Your feedback helps us improve.",
      "meh",
    ],
    [
      3,
      "Thanks for your feedback.",
      "We're always working to make NewsSpend better.",
      "meh",
    ],
    [
      4,
      "Glad you're enjoying NewsSpend!",
      "Thanks for being part of our community.",
      "happy",
    ],
    [
      5,
      "We love that you love NewsSpend!",
      "Thank you for your support.",
      "love",
    ],
  ] as const)("returns the copy for %i stars", (rating, title, subtitle, mood) => {
    expect(ratingContent(rating)).toEqual({ title, subtitle, mood });
  });

  it("covers exactly the ratings one to five", () => {
    expect(RATINGS).toEqual([1, 2, 3, 4, 5]);
  });

  it("never mentions points, rewards or bonuses", () => {
    for (const rating of RATINGS) {
      const { title, subtitle } = ratingContent(rating);
      expect(`${title} ${subtitle}`).not.toMatch(
        /\b(points?|earn|rewards?|bonus)\b/i
      );
    }
  });
});
