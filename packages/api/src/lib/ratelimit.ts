import { type RateLimiter, ratelimit } from "@orpc/ratelimit";

import type { Context } from "../context";

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
  /**
   * Namespaces the bucket, so this middleware's budget is its own.
   *
   * Without one, every rate-limited procedure shares a single counter per
   * caller: the default is 10 requests a minute, so a client that spends it
   * on one endpoint is locked out of all the others, and adding a limit to a
   * new procedure silently tightens every existing one. Omit for the shared
   * default bucket; pass a name for anything wanting its own allowance.
   */
  name?: string;
  /**
   * What the bucket is keyed on. "caller" (the default, and what every
   * existing middleware uses) is the signed-in user, else the address. "ip"
   * is the address alone, ignoring any signed-in user, for a second, wider
   * ceiling that a caller cannot escape by minting accounts or guest ids.
   */
  by?: "caller" | "ip";
}) {
  const maxRequests = options?.maxRequests ?? 10;
  const window = options?.window ?? 60_000;
  const limiter = options?.limiter ?? createDefaultLimiter(maxRequests, window);
  const prefix = options?.name ? `${options.name}:` : "";
  const byIp = options?.by === "ip";

  // Typed to the app's context. Left to inference it widens to "any object",
  // and every handler behind this middleware then sees a loosely typed
  // `context`, which turns typed results such as `payload.find` into `any`.
  return ratelimit<Context, unknown>({
    limiter,
    key: ({ context }) => {
      if (process.env.NODE_ENV === "development") {
        return `${prefix}dev-mode`;
      }

      if (context.user && !byIp) {
        return `${prefix}user:${context.user.id}`;
      }

      // `request` can be absent (see createContext); a caller with no request
      // and no user still gets a bucket, of their own "unknown" kind, rather
      // than making the middleware throw.
      const ip =
        context.request?.headers
          .get("x-forwarded-for")
          ?.split(",")[0]
          ?.trim() ||
        context.request?.headers.get("cf-connecting-ip") ||
        "unknown";
      return `${prefix}${byIp ? "ip" : "anon"}:${ip}`;
    },
  });
}

export const rateLimitMiddleware = createRateLimitMiddleware();

/**
 * A dedicated bucket for the tweet proxy.
 *
 * It calls Twitter with our server as the egress, so it needs a ceiling — but
 * it is a content-rendering call, not a write, and it should not eat into the
 * allowance a reader needs for reporting content or posting a comment.
 */
export const tweetRateLimitMiddleware = createRateLimitMiddleware({
  name: "tweet",
  maxRequests: 30,
});

/**
 * A dedicated bucket for news search.
 *
 * Search is read-only and cheap relative to writes, and a reader typing in
 * the search field can fire a query every 350ms once they hit two
 * characters, so it gets a wider ceiling than the shared default — but still
 * its own, so a burst of searches cannot spend the allowance needed for
 * reactions or comments.
 */
export const newsSearchRateLimitMiddleware = createRateLimitMiddleware({
  name: "news-search",
  maxRequests: 30,
  window: 60_000,
});

/**
 * A dedicated bucket for reader analytics.
 *
 * The app flushes every ten seconds and once more on backgrounding, which is
 * about eight requests a minute; 30 leaves room for retries and a queue
 * catching up after being offline, without letting one caller write unbounded
 * events. It has its own name so a reader's analytics never spend the
 * allowance they need to report or comment, and so tightening this never
 * tightens them.
 */
export const newsTrackRateLimitMiddleware = createRateLimitMiddleware({
  name: "news-track",
  maxRequests: 30,
});

/**
 * A dedicated bucket for the partner conversion webhook.
 *
 * It is a `publicProcedure` with no login, so it was previously bounded only
 * by whether a postback's signature verified — an unsigned flood still reaches
 * the handler, does a DB lookup by clickId, and (on a rejection) writes a
 * `partner_postbacks` row before being turned away. Its own bucket keeps that
 * cost capped without spending the shared default allowance a caller might
 * need elsewhere. Sized above a legitimate partner's real traffic (retries on
 * their side included), not tuned to typical volume.
 */
export const partnerWebhookRateLimitMiddleware = createRateLimitMiddleware({
  name: "partner-webhook",
  maxRequests: 60,
});

/**
 * A dedicated bucket for Discover usage events. Same shape and allowance as
 * the news analytics bucket (a flush every ten seconds plus one on
 * backgrounding), kept separate so one cannot spend the other's budget.
 */
export const discoverTrackRateLimitMiddleware = createRateLimitMiddleware({
  name: "discover-track",
  maxRequests: 30,
});

/**
 * Buckets for partner content impressions and taps.
 *
 * The endpoint is public and writes a row per event, so it has two ceilings.
 * The first is per caller (user, else address) at 30 a minute: the app flushes
 * about eight times a minute, so this is roomy for a real device and tight
 * for a script. The second is per address alone at 300 a minute, so a caller
 * cannot multiply the first by changing user or guest identity, while a whole
 * carrier or office NAT of real readers still fits under it.
 */
export const partnerEventsRateLimitMiddleware = createRateLimitMiddleware({
  name: "partner-events",
  maxRequests: 30,
});

export const partnerEventsIpRateLimitMiddleware = createRateLimitMiddleware({
  name: "partner-events-ip",
  maxRequests: 300,
  by: "ip",
});
