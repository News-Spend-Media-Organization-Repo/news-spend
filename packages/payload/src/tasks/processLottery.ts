import { addWeeks, isAfter, isEqual, startOfWeek } from "date-fns";
import type { TaskConfig } from "payload";

import { sendLotteryNotification } from "../lib/lottery-notification";
import { LotteryEngine } from "../lib/lottery/LotteryEngine";

/**
 * Payload job task: processLottery
 *
 * Handles lottery processing:
 * 1. Processes any expired lotteries (picks winners, notifies them, marks inactive)
 * 2. Creates a new lottery if it's the scheduled 2-week period
 *
 * Queued by cron job or manually via the lottery.processLottery oRPC endpoint
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

    // Step 1: Process any expired active lotteries
    const activeLotteries = await payload.find({
      collection: "lottery",
      where: { isActive: { equals: true } },
    });

    let processedExpired = 0;

    for (const lottery of activeLotteries.docs) {
      const now = new Date();
      const endDate = new Date(lottery.endDate);

      if (isAfter(now, endDate) || isEqual(now, endDate)) {
        logger.info(
          `Processing expired lottery ${lottery.id} (ended ${lottery.endDate})`
        );

        const lotteryEngine = new LotteryEngine(payload);
        await lotteryEngine.runLottery();
        await sendLotteryNotification({
          lotteryId: lottery.id,
          payload,
        });

        await payload.update({
          collection: "lottery",
          id: lottery.id,
          data: { isActive: false },
        });

        processedExpired += 1;
      }
    }

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
