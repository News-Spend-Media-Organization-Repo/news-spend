import type { Payload } from "payload";
import { DEFAULT_INTERESTS, DEFAULT_PROFILE } from "./model";

export const DEMO_OPPORTUNITY_PROFILE = {
  ...DEFAULT_PROFILE,
  interests: ["jobs", "technology", "immigration"],
  preferences: {
    jobs: [
      "IT & Digital",
      "Business & Governance",
      "Customer & Technical Support",
    ],
    technology: ["AI & Data", "Software & Cloud"],
    immigration: ["Canada", "United Kingdom"],
  },
  personalized: true,
  consent: true,
};

const examples = [
  {
    key: "business-analyst",
    title: "Senior Business Analyst – Digital Transformation",
    category: "jobs",
    location: "Canada",
    preferences: ["Business & Governance"],
    details: { "Work Arrangement": "Hybrid", "Employment Type": "Full-time" },
  },
  {
    key: "ai-skills",
    title: "AI Skills Development Program",
    category: "technology",
    location: "Online",
    preferences: ["AI & Data"],
    details: { Format: "Online training", Topic: "AI & Data" },
  },
  {
    key: "technical-support",
    title: "Technical Support Specialist",
    category: "jobs",
    location: "Canada",
    preferences: ["Customer & Technical Support"],
    details: { "Work Arrangement": "Remote" },
  },
  {
    key: "immigration-update",
    title: "Canadian Immigration Program Update",
    category: "immigration",
    location: "Canada",
    preferences: ["Canada"],
    details: { Destination: "Canada", Type: "Government update" },
  },
  {
    key: "technology-scholarship",
    title: "Graduate Technology Scholarship",
    category: "education",
    location: "Canada",
    preferences: ["Graduate/Postgraduate"],
    details: {
      "Study Level": "Graduate/Postgraduate",
      Funding: "Fictional demonstration funding",
    },
  },
] as const;

/**
 * Explicit local/staging demonstration only. The caller supplies a dedicated
 * test user's ID; no account, password, email or push delivery is fabricated.
 */
export async function seedOpportunityDemo(
  payload: Payload,
  testUserId: string,
  now = Date.now()
) {
  if (
    process.env.FOR_YOU_DEMO_SEED !== "true" ||
    process.env.APP_ENV === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "Demonstration content is opt-in: set FOR_YOU_DEMO_SEED=true, and never in production"
    );
  }
  const user = await payload.findByID({ collection: "users", id: testUserId });
  if (!user) {
    throw new Error("A dedicated non-production test user is required");
  }
  for (const interest of DEFAULT_INTERESTS) {
    const found = await payload.find({
      collection: "opportunity-interests",
      where: { key: { equals: interest.key } },
      limit: 1,
    });
    if (!found.docs.length) {
      await payload.create({
        collection: "opportunity-interests",
        data: { ...interest, active: true },
      });
    }
  }
  const foundSource = await payload.find({
    collection: "opportunity-sources",
    where: {
      feedUrl: { equals: "https://example.org/newsspend-demo/feed.json" },
    },
    limit: 1,
  });
  const source =
    foundSource.docs[0] ??
    (await payload.create({
      collection: "opportunity-sources",
      data: {
        title: "Fictional NewsSpend demonstration source",
        feedUrl: "https://example.org/newsspend-demo/feed.json",
        category: "jobs",
        status: "approved",
        trust: "unverified",
        ownershipReview: "unreviewed",
        reviewNotes:
          "Fictional local test data. These are not real opportunities or verified sources.",
      },
    }));
  const seeded = [];
  for (const [index, example] of examples.entries()) {
    const canonicalUrl = `https://example.org/newsspend-demo/${example.key}`;
    const existing = await payload.find({
      collection: "opportunities",
      where: { canonicalUrl: { equals: canonicalUrl } },
      limit: 1,
    });
    const data = {
      title: example.title,
      category: example.category,
      categories: [example.category],
      location: example.location,
      preferences: [...example.preferences],
      details: example.details,
      summary:
        "[DEMONSTRATION ONLY] Fictional content for testing NewsSpend's For You journey. Do not apply or treat this as an available opportunity.",
      kind:
        example.category === "immigration"
          ? ("news" as const)
          : ("opportunity" as const),
      canonicalUrl,
      provider: "Fictional demo provider",
      source: source.id,
      status: "published" as const,
      publishedAt: new Date(now - index * 3_600_000).toISOString(),
      deadline:
        example.category === "immigration"
          ? null
          : new Date(now + (index + 3) * 86_400_000).toISOString(),
      popularity: 20 - index,
    };
    seeded.push(
      existing.docs[0]
        ? await payload.update({
            collection: "opportunities",
            id: existing.docs[0].id,
            data,
          })
        : await payload.create({ collection: "opportunities", data })
    );
  }
  const profiles = await payload.find({
    collection: "opportunity-profiles",
    where: { user: { equals: testUserId } },
    limit: 1,
  });
  if (profiles.docs[0]) {
    await payload.update({
      collection: "opportunity-profiles",
      id: profiles.docs[0].id,
      data: { preferences: DEMO_OPPORTUNITY_PROFILE },
    });
  } else {
    await payload.create({
      collection: "opportunity-profiles",
      data: { user: testUserId, preferences: DEMO_OPPORTUNITY_PROFILE },
    });
  }
  const scholarship = seeded.find((item) => item.category === "education");
  if (scholarship) {
    const eventKey = `demo:${testUserId}:education`;
    const events = await payload.find({
      collection: "opportunity-events",
      where: { eventKey: { equals: eventKey } },
      limit: 1,
    });
    if (!events.docs.length) {
      await payload.create({
        collection: "opportunity-events",
        data: {
          user: testUserId,
          opportunity: scholarship.id,
          category: "education",
          action: "more",
          eventKey,
        },
      });
    }
  }
  return {
    userId: testUserId,
    opportunities: seeded.map((item) => item.id),
    demonstrationOnly: true,
  };
}
