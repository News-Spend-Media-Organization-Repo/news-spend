import { RATINGS, ratingContent, TONE_COLORS } from "../ratingContent";

describe("ratingContent", () => {
  it.each([
    [
      1,
      "We'd like to do better.",
      "Thanks for sharing your feedback.",
      "sad",
      "slate",
    ],
    [
      2,
      "Thanks for letting us know.",
      "Your feedback helps us improve.",
      "meh",
      "amber",
    ],
    [
      3,
      "Thanks for your feedback.",
      "We're always working to make NewsSpend better.",
      "happy",
      "indigo",
    ],
    [
      4,
      "Glad you're enjoying NewsSpend!",
      "Thanks for being part of our community.",
      "happy",
      "green",
    ],
    [
      5,
      "We love that you love NewsSpend!",
      "Thank you for your support.",
      "love",
      "rose",
    ],
  ] as const)("returns the copy and look for %i stars", (rating, title, subtitle, mood, tone) => {
    expect(ratingContent(rating)).toEqual({ title, subtitle, mood, tone });
  });

  it("has a colour pair for every tone in use", () => {
    for (const rating of RATINGS) {
      const { tile, icon } = TONE_COLORS[ratingContent(rating).tone];
      expect(tile).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(icon).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
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
