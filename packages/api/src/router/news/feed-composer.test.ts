import { describe, expect, it } from "bun:test";

import { createFakePayload } from "../../test-utils";
import { type AdConfig, createAdManager } from "./ad-manager";
import { DEFAULT_FEED_CONFIG, FeedComposer } from "./feed-composer";

const PLACEMENT = "homepage-ads-banner";

const CONFIG: AdConfig = {
  inHouseAdProbability: 1,
  googleAdSlot: "banner_1",
  placements: [PLACEMENT],
  poolSize: 10,
};

const article = (id: string) => ({ id, title: id }) as never;

describe("FeedComposer", () => {
  it("never emits a rewardTask row at the top level, but related news may carry the tagged card", async () => {
    const payload = createFakePayload({
      collections: {
        "partner-content": [
          {
            id: "p1",
            title: "P1",
            status: "active",
            placements: [PLACEMENT],
          },
        ],
      },
    });
    const adManager = await createAdManager(payload as never, CONFIG);
    const composer = new FeedComposer({
      adManager,
      config: DEFAULT_FEED_CONFIG,
    });

    const mainNews = Array.from({ length: 40 }, (_, i) => article(`n${i}`));
    const relatedNews = Array.from({ length: 4 }, (_, i) => article(`r${i}`));

    let sawTaggedCard = false;
    for (let run = 0; run < 25; run++) {
      const feed = composer.composeFeed({
        mainNews,
        relatedNews,
        promotionMedia: [],
        relatedSeed: `seed-${run}`,
      });

      for (const item of feed) {
        const row = item as { type?: string; _type?: string };
        expect(row.type).not.toBe("rewardTask");
        expect(row._type).not.toBe("rewardTask");
        if (row._type === "relatedNews") {
          const data = (item as { data: { _type?: string }[] }).data;
          sawTaggedCard ||= data.some((d) => d._type === "rewardTask");
        }
      }
    }
    expect(sawTaggedCard).toBe(true);
  });
});
