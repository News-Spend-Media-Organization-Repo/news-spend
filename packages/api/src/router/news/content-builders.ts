import { randomUUID } from "node:crypto";
import type { News, PartnerContent } from "@news-spend-media/payload/types";
import { createRandom, hashSeed, shuffleWith } from "./seeded-random";

export type RelatedNewsItem = {
  _type: "relatedNews";
  type: "relatedNews";
  id: string;
  data: (News | PartnerContent | (PartnerContent & { _type: string }))[];
};

export type PromotionMediaItem = {
  _type: "promotionMedia";
  type: "adCarousel";
  id: string;
  payload: PartnerContent;
};

export type GoogleAdItem = {
  _type: "ad";
  type: "gAd";
  id: string;
  payload: { slot: string };
};

export type InHouseAdItem = {
  _type: "ad";
  type: "inHouse";
  id: string;
  payload: PartnerContent;
};

export type AdItem = GoogleAdItem | InHouseAdItem;
export type FeedItem = News | RelatedNewsItem | PromotionMediaItem | AdItem;

/**
 * Builds a related news section with optional reward task insertion
 */
export function buildRelatedNews(
  docs: News[],
  randomTaskItem?: PartnerContent,
  seed?: string
): RelatedNewsItem {
  const rng = seed ? createRandom(hashSeed(seed)) : Math.random;

  let shuffledDocs: (
    | News
    | PartnerContent
    | (PartnerContent & { _type: string })
  )[] = shuffleWith(docs, rng);

  if (randomTaskItem) {
    // Insert randomTaskItem at a random position in the array
    const insertIndex = Math.floor(rng() * (shuffledDocs.length + 1));
    shuffledDocs = [
      ...shuffledDocs.slice(0, insertIndex),
      // "rewardTask" is a historical tag, kept because old and new clients both render it in the carousel.
      { _type: "rewardTask", ...randomTaskItem },
      ...shuffledDocs.slice(insertIndex),
    ];
  }

  return {
    _type: "relatedNews",
    /*
     * Derived from the seed, not a fresh UUID. The client keys feed rows by
     * this id, so a new one on every recompose made LegendList tear the row
     * down and mount a replacement — the visible "related news changed"
     * even when the articles inside it were identical. A stable id lets the
     * row update in place.
     */
    id: seed
      ? `related-${hashSeed(seed).toString(36)}`
      : `related-${randomUUID()}`,
    data: shuffledDocs,
  };
}

/**
 * Builds a promotion media item for the feed
 */
export function buildPromotionMedia(promo: PartnerContent): PromotionMediaItem {
  return {
    _type: "promotionMedia",
    type: "adCarousel",
    id: `promo-${randomUUID()}`,
    payload: promo,
  };
}

/**
 * Creates a Google Ad item
 */
export function buildGoogleAd(slot = "banner_1"): GoogleAdItem {
  return {
    _type: "ad",
    type: "gAd",
    id: `gAd-${randomUUID()}`,
    payload: { slot },
  };
}

/**
 * Creates an in-house ad item
 */
export function buildInHouseAd(partnerContent: PartnerContent): InHouseAdItem {
  return {
    _type: "ad",
    type: "inHouse",
    id: `inHouse-${randomUUID()}`,
    payload: partnerContent,
  };
}
