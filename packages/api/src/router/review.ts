import { sql } from "@payloadcms/db-postgres/drizzle";
import z from "zod";

import { protectedNoGuestProcedure } from "../index";
import { createRateLimitMiddleware } from "../lib/ratelimit";
import { cooldownCutoff, isLoyal, REVIEW_COOLDOWN_DAYS } from "../review/rules";

/**
 * Its own budget, not the shared one. Without a `name` every limiter shares a
 * single counter per user in production, so a reader who has just made a few
 * dozen engagement calls and then claims a prize would have the review prompt
 * silently refused, and review calls would eat the allowance comments and
 * reports need.
 */
export const REVIEW_RATE_LIMIT = {
  name: "review",
  maxRequests: 10,
  window: 60_000,
} as const;

const reviewRateLimit = createRateLimitMiddleware(REVIEW_RATE_LIMIT);

/** The kill switch must work however an operator spells "off". */
function promptsDisabled(value: string | undefined): boolean {
  return ["false", "0", "off", "no"].includes(
    value?.trim().toLowerCase() ?? ""
  );
}

const REVIEW_TRIGGERS = [
  "PRIZE_CLAIMED",
  "PRIZE_DELIVERED",
  "LOYAL_USER",
] as const;

const RecordPromptInput = z.object({ trigger: z.enum(REVIEW_TRIGGERS) });

type RecordPromptResult =
  | { won: true }
  /**
   * `promptedAt` is when this user was last prompted, so the app can mirror the
   * real date instead of guessing "now" and over-extending its own cap.
   */
  | { won: false; reason: "cooldown"; promptedAt: string }
  | { won: false; reason: "disabled" | "not_loyal" };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ask for the one automatic review prompt this user is allowed per window.
 *
 * The server decides, not the app, so the cap holds across reinstalls and
 * devices and two devices cannot both win. The slot is claimed before the app
 * launches the dialog: a dialog the OS then declines to show still counts,
 * which matches the stores' own quotas and means a failure can never loop.
 *
 * This records that we asked. It says nothing about whether anyone reviewed;
 * neither store reports that back.
 */
const recordPrompt = protectedNoGuestProcedure
  .use(reviewRateLimit)
  .input(RecordPromptInput)
  .handler(async ({ input, context }): Promise<RecordPromptResult> => {
    // Read on every call so the switch can be flipped without a code change.
    if (promptsDisabled(process.env.REVIEW_PROMPTS_ENABLED)) {
      return { won: false, reason: "disabled" };
    }

    const { payload, user } = context;
    const db = payload.db.drizzle;
    const now = new Date();

    const { rows: capRows } = await db.execute<{
      review_prompted_at: Date | string | null;
    }>(sql`SELECT review_prompted_at FROM users WHERE id = ${user.id}::uuid`);

    const promptedAt = capRows[0]?.review_prompted_at;
    if (promptedAt && new Date(promptedAt) > cooldownCutoff(now)) {
      return {
        won: false,
        reason: "cooldown",
        promptedAt: new Date(promptedAt).toISOString(),
      };
    }

    // The engagement scan only runs for this trigger, and only once the cap has
    // passed, so an ordinary reader's Home visits never reach it.
    if (input.trigger === "LOYAL_USER") {
      const { rows } = await db.execute<{
        active_days: number | string;
        sessions: number | string;
        has_activity: boolean;
      }>(sql`
        SELECT
          (SELECT count(DISTINCT date_trunc('day', "timestamp" AT TIME ZONE 'UTC'))
             FROM news_analytics WHERE user_id = ${user.id})::int AS active_days,
          (SELECT count(DISTINCT session_id)
             FROM news_analytics WHERE user_id = ${user.id})::int AS sessions,
          EXISTS (SELECT 1 FROM activities WHERE user_id = ${user.id}::uuid) AS has_activity
      `);

      const row = rows[0];
      const createdAt = user.createdAt ? new Date(user.createdAt) : now;
      const loyal = isLoyal({
        accountAgeDays: Math.floor(
          (now.getTime() - createdAt.getTime()) / DAY_MS
        ),
        activeDays: Number(row?.active_days ?? 0),
        sessions: Number(row?.sessions ?? 0),
        activities: row?.has_activity ? 1 : 0,
      });
      if (!loyal) {
        return { won: false, reason: "not_loyal" };
      }
    }

    // The conditional update is what makes this safe under concurrency: of two
    // simultaneous calls only one finds the row still outside the window.
    const { rows: claimed } = await db.execute<{ id: string }>(sql`
      UPDATE users SET review_prompted_at = now()
      WHERE id = ${user.id}::uuid
        AND (review_prompted_at IS NULL
             OR review_prompted_at < now() - make_interval(days => ${REVIEW_COOLDOWN_DAYS}))
      RETURNING id
    `);

    // Losing the update means another device claimed the slot a moment ago, so
    // "now" is the closest honest answer.
    return claimed.length > 0
      ? { won: true }
      : { won: false, reason: "cooldown", promptedAt: now.toISOString() };
  });

export const reviewRouter = {
  recordPrompt,
};
