import { describe, expect, it } from "bun:test";
import { DEFAULT_PROFILE } from "@news-spend-media/payload/opportunities/model";
import { processOpportunitiesTask } from "@news-spend-media/payload/tasks/processOpportunities";
import { createFakePayload } from "../test-utils";

const user = "243c338f-6378-44da-92c5-9551d0ec8459";
const now = Date.now();
function fixture(
  options: {
    paused?: boolean;
    expired?: boolean;
    recentDigest?: boolean;
    digest?: boolean;
    disabledDigest?: boolean;
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
      "opportunity-settings": { dailyDigestEnabled: !options.disabledDigest },
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
});
