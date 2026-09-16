import type { News, PartnerContent } from "@news-spend-media/payload/types";

import type { AdManager } from "./ad-manager";
import type { FeedItem } from "./content-builders";
import {
  buildPromotionMedia,
  buildRelatedNews,
  buildRewardTask,
} from "./content-builders";
import { createRandom, hashSeed } from "./seeded-random";

export type FeedRule = {
  type: "ad" | "promotionMedia" | "rewardTask" | "relatedNews";
  frequency: number; // Every nth item
  probability: number; // Chance of injection (0-1)
  priority: number; // Lower number = higher priority
  position?: "inline" | "end"; // Where to inject
};

export type FeedComposerConfig = {
  rules: FeedRule[];
};

export type FeedComposerOptions = {
  adManager: AdManager;
  config: FeedComposerConfig;
};

export type FeedComposerData = {
  mainNews: News[];
  relatedNews: News[];
  promotionMedia: PartnerContent[];
  /**
   * Seeds the related-news block's page pick and shuffle. A stable seed
   * means a recompose yields the identical block instead of reshuffling it
   * under a user who just returned to the app.
   */
  relatedSeed?: string;
};

/**
 * Default feed composition rules for homepage
 */
export const DEFAULT_FEED_RULES: FeedRule[] = [
  {
    type: "ad",
    frequency: 3, // Every 3rd item
    probability: 1.0, // Always
    priority: 1, // Highest priority
    position: "inline",
  },
  {
    type: "promotionMedia",
    frequency: 5, // Every 5th item
    probability: 0.7, // 70% chance
    priority: 2,
    position: "inline",
  },
  {
    type: "rewardTask",
    frequency: 7, // Every 7th item
    probability: 0.5, // 50% chance
    priority: 4,
    position: "inline",
  },
  {
    type: "relatedNews",
    frequency: 1, // Only once
    probability: 0.9, // 90% chance
    priority: 3,
    position: "end",
  },
];

export const DEFAULT_FEED_CONFIG: FeedComposerConfig = {
  rules: DEFAULT_FEED_RULES,
};

/**
 * Feed Composer class for building complex feeds with injection rules.
 *
 * All content injection is synchronous. Partner content is drawn from the
 * AdManager's pre-fetched pool, eliminating N+1 queries during composition.
 */
export class FeedComposer {
  private readonly adManager: AdManager;
  private readonly config: FeedComposerConfig;

  constructor(options: FeedComposerOptions) {
    this.adManager = options.adManager;
    this.config = options.config;
  }

  /**
   * Composes the final feed with all injection rules applied.
   * Synchronous, with no DB queries during composition.
   */
  composeFeed(data: FeedComposerData): FeedItem[] {
    const { mainNews, relatedNews, promotionMedia, relatedSeed } = data;
    const feed: FeedItem[] = [];

    // Sort rules by priority (lower number = higher priority)
    const sortedRules = [...this.config.rules].sort(
      (a, b) => a.priority - b.priority
    );

    // Process inline rules
    const inlineRules = sortedRules.filter((rule) => rule.position !== "end");

    for (let index = 0; index < mainNews.length; index++) {
      const item = mainNews[index];
      if (!item) {
        continue;
      }

      // Apply inline rules in priority order
      for (const rule of inlineRules) {
        if (this.shouldInjectContent(rule, index)) {
          const injectedContent = this.createContentForRule(rule, {
            relatedNews,
            promotionMedia,
            relatedSeed,
          });
          if (injectedContent) {
            feed.push(injectedContent);
          }
        }
      }

      // Always add the main news item after potential injections
      feed.push(item);
    }

    // Process end rules
    const endRules = sortedRules.filter((rule) => rule.position === "end");
    for (const rule of endRules) {
      if (this.rollForRule(rule, relatedSeed) < rule.probability) {
        const injectedContent = this.createContentForRule(rule, {
          relatedNews,
          promotionMedia,
          relatedSeed,
        });
        if (injectedContent) {
          feed.push(injectedContent);
        }
      }
    }

    return feed;
  }

  /**
   * The roll deciding whether an end-positioned rule fires.
   *
   * Seeded for relatedNews so the block's presence is as stable as its
   * contents: an unseeded roll against a 0.9 probability dropped the block
   * entirely on roughly one recompose in ten, which reads to a returning
   * user as the related news vanishing rather than merely changing.
   */
  private rollForRule(rule: FeedRule, relatedSeed?: string): number {
    if (relatedSeed && rule.type === "relatedNews") {
      return createRandom(hashSeed(`${relatedSeed}:present`))();
    }
    return Math.random();
  }

  /**
   * Determines if content should be injected based on rule criteria
   */
  private shouldInjectContent(rule: FeedRule, index: number): boolean {
    // Check frequency (every nth item)
    const frequencyMatch =
      (index === 0 && rule.type === "ad") ||
      (index > 0 && index % rule.frequency === 0);

    if (!frequencyMatch) {
      return false;
    }

    // Check probability
    return Math.random() < rule.probability;
  }

  /**
   * Creates content based on the rule type.
   * Draws partner content from the AdManager's pre-fetched pool.
   */
  private createContentForRule(
    rule: FeedRule,
    data: {
      relatedNews: News[];
      promotionMedia: PartnerContent[];
      relatedSeed?: string;
    }
  ): FeedItem | null {
    try {
      switch (rule.type) {
        case "ad":
          return this.adManager.pickAd();

        case "promotionMedia":
          if (data.promotionMedia.length > 0) {
            const randomIndex = Math.floor(
              Math.random() * data.promotionMedia.length
            );
            const randomPromo = data.promotionMedia[randomIndex];
            if (randomPromo) {
              return buildPromotionMedia(randomPromo);
            }
          }
          return null;

        case "rewardTask": {
          const taskContent = this.adManager.getPartnerContent();
          if (!taskContent) {
            return null;
          }
          return buildRewardTask(taskContent);
        }

        case "relatedNews": {
          const taskContentForRelated = data.relatedSeed
            ? this.adManager.getSeededPartnerContent(data.relatedSeed)
            : this.adManager.getPartnerContent();
          return buildRelatedNews(
            data.relatedNews,
            taskContentForRelated,
            data.relatedSeed
          );
        }

        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}

/**
 * Composes a feed with all injection rules applied.
 * Synchronous: the AdManager's pool was pre-fetched during init.
 */
export function composeFeed(
  adManager: AdManager,
  data: FeedComposerData,
  config: FeedComposerConfig = DEFAULT_FEED_CONFIG
): FeedItem[] {
  const composer = new FeedComposer({ adManager, config });
  return composer.composeFeed(data);
}

/**
 * Creates a simplified feed with just ads injected (for backwards compatibility).
 * Synchronous: ads are picked from the AdManager's pre-fetched pool.
 */
export function composeSimpleFeed(
  mainNews: News[],
  adManager: AdManager,
  adFrequency = 4
): FeedItem[] {
  const feed: FeedItem[] = [];

  for (let index = 0; index < mainNews.length; index++) {
    // Inject ads every nth item (including the first if frequency allows)
    if (index % adFrequency === 0) {
      const ad = adManager.pickAd();
      feed.push(ad);
    }
    const item = mainNews[index];
    if (item) {
      feed.push(item);
    }
  }

  return feed;
}
