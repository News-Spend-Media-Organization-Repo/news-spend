import { describe, expect, it } from "bun:test";
import { seedOpportunityDemo } from "@news-spend-media/payload/opportunities/demo";
import { call } from "@orpc/server";
import { createFakePayload, mockContext } from "../test-utils";
import { forYouRouter } from "./forYou";

describe("documented fictional For You demonstration", () => {
  it("seeds the exact interest/refinement example idempotently and exposes discovery", async () => {
    const user = {
      id: "46f44cb1-5e67-4da2-a196-8c058a07f89d",
      isAnonymous: false,
      username: "fictional-demo-reader",
    };
    const payload = createFakePayload({
      collections: {
        users: [user],
        "opportunity-sources": [],
        "opportunity-interests": [],
        opportunities: [],
        "opportunity-profiles": [],
        "opportunity-events": [],
      },
    });
    const context = mockContext({ payload, user: user as never });
    await seedOpportunityDemo(context.payload, user.id);
    await seedOpportunityDemo(context.payload, user.id);
    expect(payload.docs("opportunity-interests")).toHaveLength(13);
    expect(payload.docs("opportunities")).toHaveLength(5);
    expect(payload.docs("opportunity-profiles")).toHaveLength(1);
    expect(payload.docs("opportunity-events")).toHaveLength(1);
    // Fake local API relationship population is explicit; real Payload populates this.
    for (const opportunity of payload.docs("opportunities")) {
      opportunity.source = payload.docs("opportunity-sources")[0];
    }
    const feed = await call(forYouRouter.feed, { limit: 20 }, { context });
    expect(
      feed.items.some((item) => item.category === "education" && item.discovery)
    ).toBe(true);
    expect(
      (await call(forYouRouter.profile, undefined, { context })).preferences
        .jobs
    ).toHaveLength(3);
    expect(
      payload
        .docs("opportunities")
        .every((item) => item.summary.includes("DEMONSTRATION ONLY"))
    ).toBe(true);
  });
  it("refuses production seeding", async () => {
    const original = process.env.APP_ENV;
    try {
      process.env.APP_ENV = "production";
      await expect(
        seedOpportunityDemo(mockContext().payload, "test")
      ).rejects.toThrow("cannot be seeded in production");
    } finally {
      if (original === undefined) {
        delete process.env.APP_ENV;
      } else {
        process.env.APP_ENV = original;
      }
    }
  });
});
