import { type RateLimiter, ratelimit } from "@orpc/ratelimit";

/**
 * Resolve the limiter backend lazily so only the adapter matching the current
 * environment is loaded: `@orpc/bun` (Redis) when REDIS_URL is configured,
 * otherwise the in-memory fallback for local dev.
 */
async function loadDefaultLimiterFactory(): Promise<
  (maxRequests: number, window: number) => RateLimiter
> {
  if (process.env.REDIS_URL) {
    const { BunRedisRateLimiter } = await import("@orpc/bun");
    const { redis } = await import("bun");
    return (maxRequests, window) =>
      new BunRedisRateLimiter(redis, { maxRequests, window });
  }

  const { MemoryRateLimiter } = await import("@orpc/ratelimit/memory");
  return (maxRequests, window) =>
    new MemoryRateLimiter({ maxRequests, window });
}

const createDefaultLimiter = await loadDefaultLimiterFactory();

export function createRateLimitMiddleware(options?: {
  limiter?: RateLimiter;
  maxRequests?: number;
  window?: number;
}) {
  const maxRequests = options?.maxRequests ?? 10;
  const window = options?.window ?? 60_000;
  const limiter = options?.limiter ?? createDefaultLimiter(maxRequests, window);

  return ratelimit({
    limiter,
    key: ({ context }) => {
      if (process.env.NODE_ENV === "development") {
        return "dev-mode";
      }

      if (context.user) {
        return `user:${context.user.id}`;
      }

      const ip =
        context.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        context.request.headers.get("cf-connecting-ip") ||
        "unknown";
      return `anon:${ip}`;
    },
  });
}

export const rateLimitMiddleware = createRateLimitMiddleware();
