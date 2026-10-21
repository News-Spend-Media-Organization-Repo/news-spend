export const RATINGS = [1, 2, 3, 4, 5] as const;
export type Rating = (typeof RATINGS)[number];

export type Mood = "sad" | "meh" | "happy" | "love";

type RatingContent = { title: string; subtitle: string; mood: Mood };

/**
 * What the sheet says back for each star count.
 *
 * Purely a reaction on screen. The star count is never stored, sent, or
 * described as a rating, and it does not decide what the user can do next:
 * every rating gets the same store button.
 */
const CONTENT: Record<Rating, RatingContent> = {
  1: {
    title: "We'd like to do better.",
    subtitle: "Thanks for sharing your feedback.",
    mood: "sad",
  },
  2: {
    title: "Thanks for letting us know.",
    subtitle: "Your feedback helps us improve.",
    mood: "meh",
  },
  3: {
    title: "Thanks for your feedback.",
    subtitle: "We're always working to make NewsSpend better.",
    mood: "meh",
  },
  4: {
    title: "Glad you're enjoying NewsSpend!",
    subtitle: "Thanks for being part of our community.",
    mood: "happy",
  },
  5: {
    title: "We love that you love NewsSpend!",
    subtitle: "Thank you for your support.",
    mood: "love",
  },
};

export function ratingContent(rating: Rating): RatingContent {
  return CONTENT[rating];
}
