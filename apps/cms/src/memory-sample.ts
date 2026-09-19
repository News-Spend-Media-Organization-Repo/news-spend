import { logger } from "@news-spend-media/logger";

/**
 * Periodic RSS/heap sample for the CMS.
 *
 * Railway's memory graph shows RSS only, which cannot tell native/allocator
 * retention apart from the JS heap actually holding objects — and that split
 * is what says whether a growth problem is ours. The API server already logs
 * this; the CMS is the service that has been OOM-killed on Railway, so it
 * needs the same series to be diagnosable.
 *
 * `uptimeH` is included because a restart resets the series; without it a
 * crash-loop reads as a suspiciously flat counter.
 *
 * Read back with: `railway logs --service CMS | grep "memory sample"`.
 */
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

export function startMemorySampling(): void {
  const intervalMs = Number(
    process.env.MEMORY_SAMPLE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS
  );

  // 0 (or anything non-positive) disables sampling.
  if (!(intervalMs > 0)) {
    return;
  }

  const sample = (): void => {
    const mem = process.memoryUsage();
    const mb = (bytes: number): number => Math.round(bytes / 1024 / 1024);

    logger.info(
      {
        rssMb: mb(mem.rss),
        heapUsedMb: mb(mem.heapUsed),
        heapTotalMb: mb(mem.heapTotal),
        externalMb: mb(mem.external),
        arrayBuffersMb: mb(mem.arrayBuffers),
        uptimeH: Number((process.uptime() / 3600).toFixed(2)),
      },
      "memory sample"
    );
  };

  sample(); // t=0, so the series has a baseline for this process
  setInterval(sample, intervalMs).unref();
}
