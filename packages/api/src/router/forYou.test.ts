import { describe, expect, it } from "bun:test";
import { DEFAULT_PROFILE } from "@news-spend-media/payload/opportunities/model";
import { call } from "@orpc/server";
import { createFakePayload, expectError, mockContext } from "../test-utils";
import { forYouRouter } from "./forYou";

const userId = "d7787ca2-fc81-43ed-8df4-27ec3cc9d897";
const opportunityId = "a73de845-2eee-42c3-afd6-252ea79f11a4";
const otherId = "701b7887-a1bf-4fa1-b6a5-1ac22202f7e7";
const user = { id: userId, isAnonymous: false, username: "reader" };
const opportunity = {
  id: opportunityId,
  title: "Technology Fellowship",
  summary: "Training opportunity",
  canonicalUrl: "https://example.org/fellowship",
  category: "technology",
  kind: "opportunity",
  provider: "Provider",
  status: "published",
  publishedAt: new Date().toISOString(),
  deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  source: { id: "source-1", status: "approved", trust: "official" },
};
function fixture(guest = false) {
  const payload = createFakePayload({
    collections: {
      users: [{ ...user, isAnonymous: guest }],
      opportunities: [structuredClone(opportunity)],
      "opportunity-profiles": [],
      "opportunity-events": [],
      "saved-opportunities": [],
      "opportunity-reports": [],
      "opportunity-interests": [],
    },
  });
  return {
    payload,
    context: mockContext({
      user: { ...user, isAnonymous: guest } as never,
      payload,
    }),
  };
}

describe("forYou API", () => {
  it("includes additional classifications when filtering a category", async () => {
    const { context, payload } = fixture();
    const item = payload.docs("opportunities")[0];
    if (!item) {
      throw new Error("Missing fixture");
    }
    item.category = "education";
    item.categories = ["education", "technology"];
    item.categoryKeys = "|education|technology|";
    const result = await call(
      forYouRouter.feed,
      { category: "technology", limit: 20 },
      { context }
    );
    expect(result.items[0]?.id).toBe(opportunityId);
  });
  it("returns an honest offline Live state until a stream is configured", async () => {
    const { context } = fixture(true);
    const result = await call(forYouRouter.live, undefined, { context });
    expect(result.enabled).toBe(false);
    expect(result.streamUrl).toBeNull();
  });
  it("returns only the published Live configuration", async () => {
    const payload = createFakePayload({
      globals: {
        "opportunity-settings": {
          liveEnabled: true,
          liveTitle: "NewsSpend Live",
          liveStreamUrl: "https://video.example.org/live.m3u8",
        },
      },
    });
    const result = await call(forYouRouter.live, undefined, {
      context: mockContext({ payload }),
    });
    expect(result.enabled).toBe(true);
    expect(result.streamUrl).toBe("https://video.example.org/live.m3u8");
  });
  it("does not expose private insights or guidance to guests", async () => {
    const { context } = fixture(true);
    expect(
      (await expectError(call(forYouRouter.insights, undefined, { context })))
        .code
    ).toBe("FORBIDDEN");
    expect(
      (
        await expectError(
          call(
            forYouRouter.guidance,
            { goals: "Technology training" },
            { context }
          )
        )
      ).code
    ).toBe("FORBIDDEN");
  });
  it("shows selected interests and consent-based emerging interests", async () => {
    const { context, payload } = fixture();
    payload.docs("opportunity-profiles").push({
      id: "profile",
      user: userId,
      preferences: {
        ...DEFAULT_PROFILE,
        interests: ["jobs"],
        consent: true,
        personalized: true,
      },
    });
    payload.docs("opportunity-events").push({
      id: "event",
      user: userId,
      opportunity: opportunityId,
      category: "education",
      action: "more",
    });
    const result = await call(forYouRouter.insights, undefined, { context });
    expect(result.strongest[0]?.key).toBe("jobs");
    expect(result.emerging[0]?.key).toBe("education");
    expect(result.activityCount).toBe(1);
  });
  it("does not expose inferred interests after consent is declined", async () => {
    const { context, payload } = fixture();
    payload.docs("opportunity-events").push({
      id: "event",
      user: userId,
      opportunity: opportunityId,
      category: "education",
      action: "more",
    });
    const result = await call(forYouRouter.insights, undefined, { context });
    expect(result.emerging).toHaveLength(0);
    expect(result.activityCount).toBe(0);
  });
  it("provides published, source-grounded suggestions for a user's goals", async () => {
    const { context } = fixture();
    const result = await call(
      forYouRouter.guidance,
      { goals: "technology training" },
      { context }
    );
    expect(result.suggestions[0]?.id).toBe(opportunityId);
    expect(result.answer).toContain("published opportunities");
    expect(result.disclaimer).toContain("not an eligibility assessment");
  });
  it("does not recommend expired content through guidance or insights", async () => {
    const { context, payload } = fixture();
    payload.docs("opportunities")[0]!.deadline = "2020-01-01T00:00:00Z";
    expect(
      (await call(forYouRouter.insights, undefined, { context })).trending
    ).toHaveLength(0);
    expect(
      (await call(forYouRouter.guidance, { goals: "technology" }, { context }))
        .suggestions
    ).toHaveLength(0);
  });
  it("returns a truthful empty guidance state", async () => {
    const { context, payload } = fixture();
    payload.docs("opportunities").splice(0);
    const result = await call(
      forYouRouter.guidance,
      { goals: "Scholarships" },
      { context }
    );
    expect(result.suggestions).toHaveLength(0);
    expect(result.answer).toContain("No current opportunities");
  });
  it("exposes all thirteen default categories", async () => {
    const { context } = fixture();
    expect(
      await call(forYouRouter.catalog, undefined, { context })
    ).toHaveLength(13);
  });
  it("rejects guest profile changes", async () => {
    const { context } = fixture(true);
    const error = await expectError(
      call(forYouRouter.updateProfile, DEFAULT_PROFILE, { context })
    );
    expect(error.code).toBe("FORBIDDEN");
  });
  it("rejects unknown interests and invalid category refinements", async () => {
    const { context } = fixture();
    expect(
      (
        await expectError(
          call(
            forYouRouter.updateProfile,
            { ...DEFAULT_PROFILE, interests: ["unknown"] },
            { context }
          )
        )
      ).code
    ).toBe("BAD_REQUEST");
    expect(
      (
        await expectError(
          call(
            forYouRouter.updateProfile,
            {
              ...DEFAULT_PROFILE,
              interests: ["jobs"],
              preferences: { jobs: ["Remote Jobs"] },
            },
            { context }
          )
        )
      ).code
    ).toBe("BAD_REQUEST");
  });
  it("persists selected interests and consent", async () => {
    const { context, payload } = fixture();
    await call(
      forYouRouter.updateProfile,
      {
        ...DEFAULT_PROFILE,
        interests: ["technology"],
        consent: true,
        personalized: true,
      },
      { context }
    );
    expect(payload.docs("opportunity-profiles")[0]?.user).toBe(userId);
    expect(
      (await call(forYouRouter.profile, undefined, { context })).interests
    ).toEqual(["technology"]);
  });
  it("does not record behavioural events without consent", async () => {
    const { context, payload } = fixture();
    await call(
      forYouRouter.feedback,
      { id: opportunityId, action: "open", eventId: crypto.randomUUID() },
      { context }
    );
    expect(payload.docs("opportunity-events")).toHaveLength(0);
  });
  it("removes inferred activity when personalization is disabled", async () => {
    const { context, payload } = fixture();
    payload
      .docs("opportunity-events")
      .push({ id: "event-1", user: userId, category: "jobs", action: "open" });
    await call(forYouRouter.updateProfile, DEFAULT_PROFILE, { context });
    expect(payload.docs("opportunity-events")).toHaveLength(0);
  });
  it("saves and removes opportunities idempotently", async () => {
    const { context, payload } = fixture();
    await call(
      forYouRouter.save,
      { id: opportunityId, saved: true },
      { context }
    );
    await call(
      forYouRouter.save,
      { id: opportunityId, saved: true },
      { context }
    );
    expect(payload.docs("saved-opportunities")).toHaveLength(1);
    await call(
      forYouRouter.save,
      { id: opportunityId, saved: false },
      { context }
    );
    expect(payload.docs("saved-opportunities")).toHaveLength(0);
  });
  it("does not let users remove somebody else's save", async () => {
    const { context, payload } = fixture();
    payload.docs("saved-opportunities").push({
      id: "other-save",
      user: otherId,
      opportunity: opportunityId,
      saveKey: `${otherId}:${opportunityId}`,
    });
    await call(
      forYouRouter.save,
      { id: opportunityId, saved: false },
      { context }
    );
    expect(payload.docs("saved-opportunities")).toHaveLength(1);
  });
  it("requires a saved opportunity before setting a reminder", async () => {
    const { context } = fixture();
    expect(
      (
        await expectError(
          call(
            forYouRouter.updateSaved,
            { id: opportunityId, reminderDays: 3 },
            { context }
          )
        )
      ).code
    ).toBe("NOT_FOUND");
  });
  it("sets reminders before known deadlines and supports tracking", async () => {
    const { context, payload } = fixture();
    await call(
      forYouRouter.save,
      { id: opportunityId, saved: true },
      { context }
    );
    await call(
      forYouRouter.updateSaved,
      { id: opportunityId, reminderDays: 3, status: "Submitted" },
      { context }
    );
    expect(payload.docs("saved-opportunities")[0]?.status).toBe("Submitted");
    expect(Date.parse(payload.docs("saved-opportunities")[0]?.reminderAt)).toBe(
      Date.parse(opportunity.deadline) - 3 * 86_400_000
    );
  });
  it("queues content reports for review", async () => {
    const { context, payload } = fixture();
    const result = await call(
      forYouRouter.report,
      { id: opportunityId, reason: "Broken link", details: "" },
      { context }
    );
    expect(result.message).toBe("Thanks. We'll review this.");
    expect(payload.docs("opportunity-reports")[0]?.user).toBe(userId);
  });
  it("returns NOT_FOUND for drafts and unapproved sources", async () => {
    const { context, payload } = fixture();
    const doc = payload.docs("opportunities")[0];
    if (doc) {
      doc.status = "draft";
    }
    expect(
      (
        await expectError(
          call(forYouRouter.detail, { id: opportunityId }, { context })
        )
      ).code
    ).toBe("NOT_FOUND");
  });
  it("keeps assistant answers grounded and does not claim eligibility", async () => {
    const { context } = fixture();
    const result = await call(
      forYouRouter.assistant,
      { id: opportunityId, question: "Am I eligible?" },
      { context }
    );
    expect(result.answer).toContain("cannot determine your eligibility");
    expect(result.source).toBe(opportunity.canonicalUrl);
  });
});
