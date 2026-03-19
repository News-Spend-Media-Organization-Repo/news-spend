import { getPayload } from "@news-spend-media/payload";
import { Cron } from "croner";

export function startLotteryJob() {
  // Run every Monday at 00:00 (midnight)
  const expr = "0 0 * * 1";

  const job = new Cron(expr, async () => {
    const payload = await getPayload();
    const logger = payload.logger;

    logger.info("Queuing scheduled lottery processing task");

    try {
      await payload.jobs.queue({
        task: "processLottery",
        input: {},
      });

      logger.info("Lottery processing task queued successfully");
    } catch (err) {
      logger.error({
        msg: "Failed to queue lottery processing task",
        err,
      });
    }
  });

  return job;
}
