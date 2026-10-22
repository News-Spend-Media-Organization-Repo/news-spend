export const RATINGS = [1, 2, 3, 4, 5] as const;
export type Rating = (typeof RATINGS)[number];

export type Mood = "sad" | "meh" | "happy" | "love";
export type Tone = "slate" | "amber" | "indigo" | "green" | "rose";

type RatingContent = {
  title: string;
  subtitle: string;
  mood: Mood;
  tone: Tone;
};

/** Tile background and icon colour for each tone. */
export const TONE_COLORS: Record<Tone, { tile: string; icon: string }> = {
  slate: { tile: "#EEF2F7", icon: "#0F172A" },
  amber: { tile: "#FFF7E6", icon: "#D97706" },
  indigo: { tile: "#EEF0FF", icon: "#4F46E5" },
  green: { tile: "#E8F8F0", icon: "#059669" },
  rose: { tile: "#FFEDF0", icon: "#F43F5E" },
};

/**
 * What the sheet says back for each star count.
 *
 * Purely a reaction on screen. The star count is never stored, sent, or
 * described as a rating, and the store page is reachable at every rating.
 */
const CONTENT: Record<Rating, RatingContent> = {
  1: {
    title: "We'd like to do better.",
    subtitle: "Thanks for sharing your feedback.",
    mood: "sad",
    tone: "slate",
  },
  2: {
    title: "Thanks for letting us know.",
    subtitle: "Your feedback helps us improve.",
    mood: "meh",
    tone: "amber",
  },
  3: {
    title: "Thanks for your feedback.",
    subtitle: "We're always working to make NewsSpend better.",
    mood: "happy",
    tone: "indigo",
  },
  4: {
    title: "Glad you're enjoying NewsSpend!",
    subtitle: "Thanks for being part of our community.",
    mood: "happy",
    tone: "green",
  },
  5: {
    title: "We love that you love NewsSpend!",
    subtitle: "Thank you for your support.",
    mood: "love",
    tone: "rose",
  },
};

export function ratingContent(rating: Rating): RatingContent {
  return CONTENT[rating];
}
