/**
 * Rules for the automatic store-review prompt.
 *
 * Kept free of I/O so the thresholds can be tested at their boundaries and
 * changed in one place. The procedure that enforces them is
 * `router/review.ts`.
 */

/** One automatic prompt per user in this window, whichever trigger fired. */
export const REVIEW_COOLDOWN_DAYS = 90;

/**
 * What a user must have done to count as a loyal reader. All four must hold:
 * opening the app many times with nothing to show for it does not qualify,
 * which is what the activity requirement is for.
 */
export const LOYAL_MIN = {
  accountAgeDays: 7,
  activeDays: 7,
  sessions: 10,
  activities: 1,
} as const;

export type EngagementStats = {
  accountAgeDays: number;
  activeDays: number;
  sessions: number;
  activities: number;
};

export function isLoyal(stats: EngagementStats): boolean {
  return (
    stats.accountAgeDays >= LOYAL_MIN.accountAgeDays &&
    stats.activeDays >= LOYAL_MIN.activeDays &&
    stats.sessions >= LOYAL_MIN.sessions &&
    stats.activities >= LOYAL_MIN.activities
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A prompt recorded before this instant no longer blocks a new one. */
export function cooldownCutoff(now: Date): Date {
  return new Date(now.getTime() - REVIEW_COOLDOWN_DAYS * DAY_MS);
}
