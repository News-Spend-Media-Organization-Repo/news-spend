import {
  createRatelimitMiddleware,
  type Ratelimiter,
} from "@orpc/experimental-ratelimit";
import { MemoryRatelimiter } from "@orpc/experimental-ratelimit/memory";

export function createRateLimitMiddleware(options?: {
  limiter?: Ratelimiter;
  maxRequests?: number;
  window?: number;
}) {
  const limiter =
    options?.limiter ??
    new MemoryRatelimiter({
      maxRequests: options?.maxRequests ?? 10,
      window: options?.window ?? 60_000,
    });

  return createRatelimitMiddleware({
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
