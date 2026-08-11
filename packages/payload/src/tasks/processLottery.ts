import { addWeeks, isAfter, isEqual, startOfWeek } from "date-fns";
import type { BasePayload, TaskConfig } from "payload";
import { LotteryEngine } from "../lib/lottery/LotteryEngine";
import { sendLotteryNotification } from "../lib/lottery-notification";

/**
 * Draw every active lottery that has passed its end date, and notify winners.
 *
 * Safe to call repeatedly: the draw is claimed with a compare-and-set, so a
 * round that has already been drawn is skipped rather than drawn again.
 */
async function processExpiredLotteries(payload: BasePayload): Promise<number> {
  const logger = payload.logger;
  const activeLotteries = await payload.find({
    collection: "lottery",
    where: { isActive: { equals: true } },
  });

  let processed = 0;

  for (const lottery of activeLotteries.docs) {
    const now = new Date();
    const endDate = new Date(lottery.endDate);

    if (!(isAfter(now, endDate) || isEqual(now, endDate))) {
      continue;
    }

    logger.info(
      `Processing expired lottery ${lottery.id} (ended ${lottery.endDate})`
    );

    // Pass the id explicitly. Called with no argument, runLottery re-queries for
    // whichever lottery is active and takes the first result — not necessarily
    // the one being iterated here, so with more than one active it would draw
    // one lottery and deactivate another.
    const result = await new LotteryEngine(payload).runLottery(lottery.id);

    if ("alreadyProcessed" in result && result.alreadyProcessed) {
      logger.info(
        `Lottery ${lottery.id} was already drawn — skipping notification`
      );
      continue;
    }

    await sendLotteryNotification({ lotteryId: lottery.id, payload });

    // runLottery already stamps processedAt and clears isActive.
    processed += 1;
  }

  return processed;
}

/**
 * Payload job task: processLottery
 *
 * 1. Draws any active lottery that has passed its end date and notifies winners.
 * 2. Creates the next lottery when the fortnightly schedule calls for one.
 *
 * Queued hourly by the cron in `@news-spend-media/api/jobs/lottery`, so a run
 * missed because the database was unreachable is retried an hour later rather
 * than a week later. Both steps are therefore written to be repeat-safe.
 *
 * A single lottery can also be drawn on demand from the CMS, via the "Run draw
 * now" button on the lottery record.
 */
export const processLotteryTask: TaskConfig<"processLottery"> = {
  slug: "processLottery",
  outputSchema: [
    {
      name: "processedExpired",
      type: "number",
    },
    {
      name: "createdNew",
      type: "checkbox",
    },
  ],
  retries: 2,
  handler: async ({ req }) => {
    const { payload } = req;
    const logger = payload.logger;

    logger.info("Starting lottery processing");

    const processedExpired = await processExpiredLotteries(payload);

    // Step 2: Check if new lottery should be created
    const now = new Date();
    const currentMonday = startOfWeek(now, { weekStartsOn: 1 });
    const scheduleStartDate = new Date("2025-01-13");
    const periodMs = 14 * 24 * 60 * 60 * 1000; // 14 days

    const periodsSinceStart = Math.floor(
      (currentMonday.getTime() - scheduleStartDate.getTime()) / periodMs
    );

    const lotteryName = currentMonday
      .toLocaleDateString("en-GB")
      .replace(/\//g, "");

    let createdNew = false;

    // Create new lottery if it's an even period (every 2 weeks)
    if (periodsSinceStart >= 0 && periodsSinceStart % 2 === 0) {
      const existingLottery = await payload.find({
        collection: "lottery",
        where: { name: { equals: lotteryName } },
        limit: 1,
      });

      if (existingLottery.docs.length === 0) {
        const startDate = currentMonday;
        const endDate = addWeeks(currentMonday, 2);

        try {
          await payload.create({
            collection: "lottery",
            data: {
              name: lotteryName,
              isActive: true,
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              ticketPrice: 50,
            },
          });

          logger.info(`Created lottery ${lotteryName}`);
          createdNew = true;
        } catch (error) {
          // The collection refuses a new lottery while an earlier one is past
          // its end date and undrawn. That is the desired outcome, not a job
          // failure: throwing here would fail the whole task and burn its
          // retries on something an administrator has to resolve. Draws that
          // did succeed above are already committed.
          logger.warn({
            msg: "Skipped creating the next lottery",
            lottery: lotteryName,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      } else {
        logger.info(`Lottery for period ${lotteryName} already exists`);
      }
    } else {
      logger.info(`Not a scheduled lottery creation period (${lotteryName})`);
    }

    logger.info({
      msg: "Lottery processing completed",
      processedExpired,
      createdNew,
    });

    return {
      output: {
        processedExpired,
        createdNew,
      },
    };
  },
};
