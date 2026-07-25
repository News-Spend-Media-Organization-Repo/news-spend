import type { PartnerContent } from "@news-spend-media/payload/types";
import type { Payload } from "payload";

import { withCache } from "../../lib/cache";
import { type AdItem, buildGoogleAd, buildInHouseAd } from "./content-builders";
import { fetchPartnerContent } from "./content-fetchers";

export type AdConfig = {
  inHouseAdProbability: number;
  googleAdSlot: string;
  placements: string[];
  /** How many partner content items to pre-fetch during init (default: 10) */
  poolSize?: number;
  /** TTL in seconds for the Redis partner content pool cache (default: 300 = 5 min) */
  poolCacheTtl?: number;
};

export type AdManagerOptions = {
  config: AdConfig;
};

/**
 * Default ad configuration for homepage
 */
export const DEFAULT_AD_CONFIG: AdConfig = {
  inHouseAdProbability: 0.65, // 65% chance for in-house ads
  googleAdSlot: "banner_1",
  placements: ["homepage-ads-banner"],
  poolSize: 10,
};

/**
 * Ad Manager class for handling ad decisioning logic.
 *
 * Pre-fetches a pool of partner content during initialization so that
 * subsequent pickAd() and getPartnerContent() calls are synchronous
 * and avoid N+1 database queries.
 */
export class AdManager {
  private readonly config: AdConfig;
  private pool: PartnerContent[] = [];
  private poolIndex = 0;

  constructor(options: AdManagerOptions) {
    this.config = options.config;
  }

  /**
   * Initialize the ad manager by pre-fetching a pool of partner content.
   * Checks Redis cache first (5 min TTL), falls back to DB query.
   */
  async initialize(payload: Payload): Promise<void> {
    try {
      const placements = this.config.placements;
      const limit = this.config.poolSize ?? 10;
      const ttl = this.config.poolCacheTtl ?? 300; // 5 minutes
      const cacheKey = `partner-content:pool:${placements.sort().join(",")}`;

      const docs = await withCache<PartnerContent[]>(
        cacheKey,
        { ttl },
        async () => {
          const result = await fetchPartnerContent({
            payload,
            placements,
            limit,
          });
          return result.docs;
        }
      );

      // Shuffle the pool so sequential draws feel random
      // (shuffle a copy — cached data should not be mutated)
      this.pool = [...docs].sort(() => Math.random() - 0.5);
      this.poolIndex = 0;
    } catch {
      // If fetching fails, pool stays empty — pickAd() will return Google ads
      this.pool = [];
      this.poolIndex = 0;
    }
  }

  /**
   * Picks an ad based on configured probability.
   * Synchronous — draws from the pre-fetched pool.
   */
  pickAd(): AdItem {
    try {
      if (
        Math.random() < this.config.inHouseAdProbability &&
        this.pool.length > 0
      ) {
        const item = this.nextFromPool();
        if (item) {
          return buildInHouseAd(item);
        }
      }
      return buildGoogleAd(this.config.googleAdSlot);
    } catch {
      return buildGoogleAd(this.config.googleAdSlot);
    }
  }

  /**
   * Gets a partner content item from the pre-fetched pool.
   * Used by FeedComposer for reward tasks and related news sections.
   * Returns undefined if pool is exhausted.
   */
  getPartnerContent(): PartnerContent | undefined {
    return this.nextFromPool();
  }

  /**
   * Whether the pool has any partner content available.
   */
  get hasPartnerContent(): boolean {
    return this.pool.length > 0;
  }

  /**
   * Creates a Google ad as fallback
   */
  createGoogleAd(): AdItem {
    return buildGoogleAd(this.config.googleAdSlot);
  }

  /**
   * Draws the next item from the pool, cycling back to the start
   * when exhausted (partner content can repeat across slots).
   */
  private nextFromPool(): PartnerContent | undefined {
    if (this.pool.length === 0) {
      return;
    }
    const item = this.pool[this.poolIndex % this.pool.length];
    this.poolIndex++;
    return item;
  }
}

/**
 * Creates and initializes an AdManager instance.
 * Pre-fetches the partner content pool (single DB query).
 */
export async function createAdManager(
  payload: Payload,
  config: AdConfig = DEFAULT_AD_CONFIG
): Promise<AdManager> {
  const adManager = new AdManager({ config });
  await adManager.initialize(payload);
  return adManager;
}
