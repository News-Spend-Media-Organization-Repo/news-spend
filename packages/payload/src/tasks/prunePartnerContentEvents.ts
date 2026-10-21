import { sql } from "@payloadcms/db-postgres";
import type { TaskConfig } from "payload";

/**
 * How long a partner content event is kept, in days. Two years, matching
 * news-analytics. Override with PARTNER_EVENTS_RETENTION_DAYS.
 */
const DEFAULT_RETENTION_DAYS = 730;

/** Rows removed per statement, so a large backlog never holds a long lock. */
const BATCH_SIZE = 10_000;

/** Stop after this many batches; the next run picks up where this left off. */
const MAX_BATCHES = 50;

/**
 * Payload job task: prunePartnerContentEvents
 *
 * Deletes partner-content impressions and clicks past the retention window,
 * in batches so a large backlog never holds a long lock.
 */
export const prunePartnerContentEventsTask: TaskConfig<"prunePartnerContentEvents"> =
  {
    slug: "prunePartnerContentEvents",
    schedule: [
      {
        // Daily at 4:30 AM, after the news-analytics prune.
        cron: "30 4 * * *",
        queue: "maintenance",
      },
    ],
    outputSchema: [
      {
        name: "deletedCount",
        type: "number",
      },
      {
        name: "hasMore",
        type: "checkbox",
      },
    ],
    retries: 1,
    handler: async ({ req }) => {
      const { payload } = req;
      const logger = payload.logger;

      const retentionDays = Number(
        process.env.PARTNER_EVENTS_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS
      );

      // A malformed env var must not be read as "delete everything".
      if (!Number.isFinite(retentionDays) || retentionDays < 1) {
        logger.error(
          `Invalid PARTNER_EVENTS_RETENTION_DAYS, skipping prune: ${process.env.PARTNER_EVENTS_RETENTION_DAYS}`
        );
        return { output: { deletedCount: 0, hasMore: false } };
      }

      const cutoff = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000
      ).toISOString();

      logger.info(
        `Pruning partner content events older than ${retentionDays} days (before ${cutoff})`
      );

      let deletedCount = 0;
      let hasMore = false;

      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const result = await payload.db.drizzle.execute(sql`
        DELETE FROM partner_content_events
        WHERE id IN (
          SELECT id FROM partner_content_events
          WHERE timestamp < ${cutoff}::timestamptz
          LIMIT ${BATCH_SIZE}
        )
        RETURNING id
      `);

        const removed = result.rows.length;
        deletedCount += removed;

        if (removed < BATCH_SIZE) {
          break;
        }

        // Hit the batch ceiling with rows still to go: leave the rest for the
        // next scheduled run rather than running long.
        if (batch === MAX_BATCHES - 1) {
          hasMore = true;
        }
      }

      logger.info(
        `Pruned ${deletedCount} partner content events${hasMore ? " (more remain)" : ""}`
      );

      return { output: { deletedCount, hasMore } };
    },
  };
