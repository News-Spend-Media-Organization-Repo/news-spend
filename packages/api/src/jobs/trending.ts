import { getPayload } from "@news-spend-media/payload";
import { Cron } from "croner";

import { computeTrendingScores } from "../router/news/trending-scorer";

export function startTrendingJob() {
  const interval = Number(process.env.TRENDING_INTERVAL_MINUTES ?? 15);
  const expr = `*/${Math.max(1, interval)} * * * *`;

  // run on schedule
  const job = new Cron(expr, async () => {
    const payload = await getPayload();
    try {
      const scored = await computeTrendingScores({ payload });
      const top = scored.slice(0, 100);
      try {
        const { getRedis } = await import("../lib/redis");
        const r = getRedis();
        // store as JSON string
        await r.set("trending:news", JSON.stringify(top), "EX", 60 * 20); // 20 minutes TTL
        // also store a sorted set for convenience
        const zKey = "trending:news:z";
        if (top.length) {
          const args: (string | number)[] = [];
          // ZADD expects score then member pairs
          for (const item of top) {
            args.push(item.score);
            args.push(item.id);
          }
          await r.del(zKey);
          await r.zadd(zKey, ...args);
          await r.expire(zKey, 60 * 20);
        }
      } catch (e) {
        // ignore redis errors
      }
    } catch (err) {
      console.error("trending job failed", err);
    }
  });

  return job;
}
