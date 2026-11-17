import { describe, expect, it } from "bun:test";
import { DEFAULT_PROFILE } from "@news-spend-media/payload/opportunities/model";
import { processOpportunitiesTask } from "@news-spend-media/payload/tasks/processOpportunities";
import { call } from "@orpc/server";
import { createFakePayload, mockContext } from "../test-utils";
import { forYouRouter } from "./forYou";

const user = "243c338f-6378-44da-92c5-9551d0ec8459";
const now = Date.now();
function fixture(
  options: {
    paused?: boolean;
    expired?: boolean;
    recentDigest?: boolean;
    digest?: boolean;
    disabledDigest?: boolean;
    featuredBoost?: number;
  } = {}
) {
  const opportunity = {
    id: "51db91be-d81a-4695-997e-566e27670eb3",
    title: "Training opportunity",
    summary: "Technology training",
    category: "technology",
    kind: "opportunity",
    canonicalUrl: "https://example.org/training",
    provider: "Example",
    location: "",
    preferences: [],
    details: {},
    popularity: 0,
    publishedAt: new Date(now - 60_000).toISOString(),
    status: "published",
    deadline: new Date(
      now + (options.expired ? -1 : 3) * 86_400_000
    ).toISOString(),
    source: { id: "source", status: "approved", trust: "official" },
  };
  return createFakePayload({
    globals: {
      "opportunity-settings": {
        dailyDigestEnabled: !options.disabledDigest,
        ...(options.featuredBoost === undefined
          ? {}
          : { featuredBoost: options.featuredBoost }),
      },
    },
    collections: {
      "opportunity-sources": [],
      opportunities: [opportunity],
      "opportunity-profiles": [
        {
          id: "profile",
          user,
          createdAt: new Date(now - 2 * 86_400_000).toISOString(),
          lastNotifiedAt: options.recentDigest
            ? new Date(now - 60_000).toISOString()
            : null,
          preferences: {
            ...DEFAULT_PROFILE,
            interests: ["technology"],
            consent: true,
            personalized: true,
            notifications: {
              ...DEFAULT_PROFILE.notifications,
              paused: options.paused ?? false,
              deadlines: !options.digest,
              opportunities: options.digest ?? false,
            },
          },
        },
      ],
      "saved-opportunities": options.digest
        ? []
        : [
            {
              id: "saved",
              user,
              opportunity,
              reminderAt: new Date(now - 60_000).toISOString(),
              reminderSentAt: null,
            },
          ],
      notifications: [],
    },
  });
}
async function run(payload: ReturnType<typeof fixture>) {
  if (typeof processOpportunitiesTask.handler !== "function") {
    throw new Error("Expected a job handler");
  }
  await processOpportunitiesTask.handler({ req: { payload } } as never);
}

describe("For You lifecycle and notification jobs", () => {
  it("queues a due saved reminder once across retries", async () => {
    const payload = fixture();
    await run(payload);
    await run(payload);
    expect(payload.docs("notifications")).toHaveLength(1);
    expect(payload.docs("notifications")[0]?.title).toBe(
      "Deadline approaching"
    );
    expect(payload.docs("saved-opportunities")[0]?.reminderSentAt).toBeTruthy();
  });
  it("does not send reminders while notifications are paused", async () => {
    const payload = fixture({ paused: true });
    await run(payload);
    expect(payload.docs("notifications")).toHaveLength(0);
    expect(payload.docs("saved-opportunities")[0]?.reminderSentAt).toBeNull();
  });
  it("expires content and does not send late deadline reminders", async () => {
    const payload = fixture({ expired: true });
    await run(payload);
    expect(payload.docs("opportunities")[0]?.status).toBe("expired");
    expect(payload.docs("notifications")).toHaveLength(0);
  });
  it("respects the daily digest interval", async () => {
    const payload = fixture({ digest: true, recentDigest: true });
    await run(payload);
    expect(payload.docs("notifications")).toHaveLength(0);
  });
  it("queues a new matching opportunity digest at most once per interval", async () => {
    const payload = fixture({ digest: true });
    await run(payload);
    await run(payload);
    expect(payload.docs("notifications")).toHaveLength(1);
    expect(payload.docs("notifications")[0]?.title).toBe(
      "Something new for you"
    );
  });
  it("honors the CMS digest kill switch", async () => {
    const payload = fixture({ digest: true, disabledDigest: true });
    await run(payload);
    expect(payload.docs("notifications")).toHaveLength(0);
  });
  it("does not digest an opportunity whose deadline has passed", async () => {
    const payload = fixture({ digest: true });
    // Newer and more popular than the valid item: it would win the ranking
    // if the digest did not exclude expired deadlines.
    payload.docs("opportunities").push({
      id: "9a1f0c3e-6b2d-4e8a-9c1f-3d5e7a9b1c3d",
      title: "Expired fellowship",
      summary: "Closed training",
      category: "technology",
      kind: "opportunity",
      canonicalUrl: "https://example.org/expired",
      provider: "Example",
      location: "",
      preferences: [],
      details: {},
      popularity: 100,
      publishedAt: new Date(now - 30_000).toISOString(),
      status: "published",
      deadline: new Date(now - 86_400_000).toISOString(),
      source: { id: "source", status: "approved", trust: "official" },
    });
    await run(payload);
    expect(payload.docs("notifications")).toHaveLength(1);
    expect(payload.docs("notifications")[0]?.body).toBe("Training opportunity");
  });
  it("ranks a featured opportunity in the digest exactly as in the feed", async () => {
    const payload = fixture({ digest: true, featuredBoost: 30 });
    // Older than the plain item, so it only wins through the featured boost.
    payload.docs("opportunities").push({
      id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      title: "Featured fellowship",
      summary: "Featured training",
      category: "technology",
      kind: "opportunity",
      canonicalUrl: "https://example.org/featured",
      provider: "Example",
      location: "",
      preferences: [],
      details: {},
      popularity: 0,
      featured: true,
      publishedAt: new Date(now - 1.5 * 86_400_000).toISOString(),
      status: "published",
      deadline: new Date(now + 10 * 86_400_000).toISOString(),
      source: { id: "source", status: "approved", trust: "official" },
    });
    const context = mockContext({
      user: { id: user, isAnonymous: false } as never,
      payload,
    });
    const feed = await call(forYouRouter.feed, { limit: 20 }, { context });
    expect(feed.items[0]?.title).toBe("Featured fellowship");
    await run(payload);
    expect(payload.docs("notifications")).toHaveLength(1);
    expect(payload.docs("notifications")[0]?.body).toBe("Featured fellowship");
  });
  it("applies the CMS featured boost to the digest, not a hardcoded one", async () => {
    const payload = fixture({ digest: true, featuredBoost: 0 });
    payload.docs("opportunities").push({
      id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      title: "Featured fellowship",
      summary: "Featured training",
      category: "technology",
      kind: "opportunity",
      canonicalUrl: "https://example.org/featured",
      provider: "Example",
      location: "",
      preferences: [],
      details: {},
      popularity: 0,
      featured: true,
      publishedAt: new Date(now - 1.5 * 86_400_000).toISOString(),
      status: "published",
      deadline: new Date(now + 10 * 86_400_000).toISOString(),
      source: { id: "source", status: "approved", trust: "official" },
    });
    const context = mockContext({
      user: { id: user, isAnonymous: false } as never,
      payload,
    });
    const feed = await call(forYouRouter.feed, { limit: 20 }, { context });
    expect(feed.items[0]?.title).toBe("Training opportunity");
    await run(payload);
    expect(payload.docs("notifications")).toHaveLength(1);
    expect(payload.docs("notifications")[0]?.body).toBe("Training opportunity");
  });
});
