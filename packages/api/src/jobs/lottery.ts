import { getPayload } from "@news-spend-media/payload";
import { Cron } from "croner";

export function startLotteryJob() {
  // Run every Monday at 00:00 (midnight)
  const expr = "0 0 * * 1";

  // see trending.ts — an unhandled rejection here exits the process
  const job = new Cron(
    expr,
    {
      catch: (err: unknown) =>
        console.error("lottery job failed to queue", err),
    },
    async () => {
      try {
        // inside the try: getPayload() throws when Postgres is unreachable
        const payload = await getPayload();
        const logger = payload.logger;

        logger.info("Queuing scheduled lottery processing task");

        await payload.jobs.queue({
          task: "processLottery",
          input: {},
        });

        logger.info("Lottery processing task queued successfully");
      } catch (err) {
        console.error("Failed to queue lottery processing task", err);
      }
    }
  );

  return job;
}
