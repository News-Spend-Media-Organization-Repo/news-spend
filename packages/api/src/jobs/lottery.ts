import { getPayload } from "@news-spend-media/payload";
import { Cron } from "croner";

export function startLotteryJob() {
  /**
   * Hourly, not weekly.
   *
   * This used to fire once a week, at Monday 00:00. When Postgres was
   * unreachable at that moment, `getPayload()` threw, the catch below logged,
   * and nothing tried again — a round sat past its end date with paid-for
   * tickets and no winners until someone noticed.
   *
   * Running hourly makes a missed window self-healing: the next attempt is an
   * hour away rather than a week. This is only safe because `processLottery`
   * is now repeat-safe — the draw is claimed with a compare-and-set so it
   * cannot run twice, and creating the next lottery is guarded by name and
   * skips rather than throws.
   */
  const expr = "0 * * * *";

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
