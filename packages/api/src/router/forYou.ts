import { randomUUID } from "node:crypto";
import {
  canonicalize,
  learnedInterests,
  rankOpportunities,
} from "@news-spend-media/payload/opportunities/engine";
import type {
  Interest,
  OpportunityContent,
  OpportunityProfile,
  Signal,
} from "@news-spend-media/payload/opportunities/model";
import {
  DEFAULT_INTERESTS,
  readProfile,
} from "@news-spend-media/payload/opportunities/model";
import { opportunitySettings } from "@news-spend-media/payload/opportunities/settings";
import { ORPCError } from "@orpc/server";
import type { Payload, Where } from "payload";
import z from "zod";
import { protectedNoGuestProcedure, publicProcedure } from "../index";
import { createRateLimitMiddleware } from "../lib/ratelimit";

const idInput = z.object({ id: z.string().uuid() });
const actionSchema = z.enum([
  "open",
  "read",
  "save",
  "share",
  "more",
  "less",
  "dismiss",
]);
const profileSchema = z.object({
  interests: z.array(z.string().min(1).max(100)).max(30),
  preferences: z.record(
    z.string().max(100),
    z.array(z.string().max(100)).max(20)
  ),
  personalized: z.boolean(),
  consent: z.boolean(),
  notifications: z.object({
    opportunities: z.boolean(),
    deadlines: z.boolean(),
    discovery: z.boolean(),
    paused: z.boolean(),
  }),
});

async function catalog(payload: Payload): Promise<Interest[]> {
  const result = await payload.find({
    collection: "opportunity-interests",
    where: { active: { equals: true } },
    limit: 100,
    depth: 0,
  });
  return result.docs.length
    ? result.docs.map((d) => ({
        key: d.key,
        label: d.label,
        preferences: Array.isArray(d.preferences)
          ? d.preferences.filter((p): p is string => typeof p === "string")
          : [],
      }))
    : DEFAULT_INTERESTS;
}

async function profileFor(
  payload: Payload,
  userId?: string
): Promise<OpportunityProfile> {
  if (!userId) {
    return readProfile(null);
  }
  const result = await payload.find({
    collection: "opportunity-profiles",
    where: { user: { equals: userId } },
    limit: 1,
    depth: 0,
  });
  return readProfile(result.docs[0]?.preferences);
}

async function signalsFor(
  payload: Payload,
  userId: string,
  profile: OpportunityProfile
): Promise<Signal[]> {
  if (!(profile.personalized && profile.consent)) {
    return [];
  }
  const result = await payload.find({
    collection: "opportunity-events",
    where: { user: { equals: userId } },
    sort: "-createdAt",
    limit: 500,
    depth: 0,
  });
  // Chronological order makes the most recent explicit feedback win.
  return result.docs.toReversed().map((d) => ({
    opportunityId:
      typeof d.opportunity === "string" ? d.opportunity : d.opportunity.id,
    category: d.category,
    action: d.action,
  }));
}

export function contentFromDoc(
  doc: Awaited<ReturnType<typeof opportunityDoc>>
): OpportunityContent {
  const source = typeof doc.source === "object" ? doc.source : null;
  return {
    id: doc.id,
    title: doc.title,
    summary: doc.summary,
    category: doc.category,
    kind: doc.kind,
    canonicalUrl: doc.canonicalUrl,
    provider: doc.provider,
    location: doc.location ?? "",
    preferences: Array.isArray(doc.preferences)
      ? doc.preferences.filter((p): p is string => typeof p === "string")
      : [],
    details:
      doc.details &&
      typeof doc.details === "object" &&
      !Array.isArray(doc.details)
        ? Object.fromEntries(
            Object.entries(doc.details).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          )
        : {},
    deadline: doc.deadline ?? null,
    publishedAt: doc.publishedAt,
    trust: source?.trust ?? "unverified",
    popularity: doc.popularity ?? 0,
    featured: doc.featured ?? false,
    quality: source?.qualityOverride ?? source?.qualityScore ?? 0,
    categories: Array.isArray(doc.categories)
      ? doc.categories.filter((x): x is string => typeof x === "string")
      : [],
  };
}

async function opportunityDoc(payload: Payload, id: string) {
  const doc = await payload.findByID({
    collection: "opportunities",
    id,
    depth: 1,
    disableErrors: true,
  });
  if (!doc || doc.status === "draft") {
    throw new ORPCError("NOT_FOUND");
  }
  if (typeof doc.source !== "object" || doc.source.status !== "approved") {
    throw new ORPCError("NOT_FOUND");
  }
  return doc;
}

const catalogGet = publicProcedure.handler(({ context }) =>
  catalog(context.payload)
);
const profileGet = protectedNoGuestProcedure.handler(async ({ context }) => {
  const profile = await profileFor(context.payload, context.user.id);
  const signals = await signalsFor(context.payload, context.user.id, profile);
  return { ...profile, learned: learnedInterests(signals) };
});

const profileUpdate = protectedNoGuestProcedure
  .input(profileSchema)
  .handler(async ({ context, input }) => {
    const interests = await catalog(context.payload);
    const keys = new Set(interests.map((i) => i.key));
    if (input.interests.some((key) => !keys.has(key))) {
      throw new ORPCError("BAD_REQUEST", { message: "Unknown interest" });
    }
    for (const [key, choices] of Object.entries(input.preferences)) {
      const allowed = interests.find((i) => i.key === key)?.preferences ?? [];
      if (
        !input.interests.includes(key) ||
        choices.some((p) => !allowed.includes(p)) ||
        (key === "jobs" && choices.length > 3)
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Invalid interest preferences",
        });
      }
    }
    const profile = {
      ...input,
      interests: [...new Set(input.interests)],
      personalized: input.personalized && input.consent,
    };
    const result = await context.payload.find({
      collection: "opportunity-profiles",
      where: { user: { equals: context.user.id } },
      limit: 1,
    });
    const existing = result.docs[0];
    if (existing) {
      await context.payload.update({
        collection: "opportunity-profiles",
        id: existing.id,
        data: { preferences: profile },
      });
    } else {
      await context.payload.create({
        collection: "opportunity-profiles",
        data: { user: context.user.id, preferences: profile },
      });
    }
    // Consent withdrawal stops inference and removes prior inferred activity.
    if (!(profile.consent && profile.personalized)) {
      await context.payload.delete({
        collection: "opportunity-events",
        where: { user: { equals: context.user.id } },
      });
    }
    return profile;
  });

const feedInput = z.object({
  category: z.string().max(100).optional(),
  query: z.string().max(120).default(""),
  offset: z.number().int().min(0).max(4999).default(0),
  limit: z.number().int().min(1).max(30).default(20),
});
const feed = publicProcedure
  .input(feedInput)
  .handler(async ({ context, input }) => {
    const userId = context.user?.isAnonymous ? undefined : context.user?.id;
    const profile = await profileFor(context.payload, userId);
    const settings = await opportunitySettings(context.payload);
    const conditions: Where[] = [
      { status: { equals: "published" } },
      {
        or: [
          { deadline: { exists: false } },
          { deadline: { greater_than: new Date().toISOString() } },
        ],
      },
      { "source.status": { equals: "approved" } },
    ];
    if (input.category) {
      conditions.push({
        or: [
          { category: { equals: input.category } },
          { categoryKeys: { contains: `|${input.category}|` } },
        ],
      });
    }
    if (input.query.trim()) {
      conditions.push({
        or: [
          { title: { like: input.query.trim() } },
          { summary: { like: input.query.trim() } },
        ],
      });
    }
    const [result, signals] = await Promise.all([
      context.payload.find({
        collection: "opportunities",
        where: { and: conditions },
        limit: settings.candidateLimit,
        sort: "-publishedAt",
        depth: 1,
      }),
      userId
        ? signalsFor(context.payload, userId, profile)
        : Promise.resolve([]),
    ]);
    const ranked = rankOpportunities(
      result.docs.map(contentFromDoc),
      profile,
      signals,
      Date.now(),
      settings
    );
    const items = ranked.slice(input.offset, input.offset + input.limit);
    return {
      items,
      nextOffset:
        input.offset + input.limit < ranked.length
          ? input.offset + input.limit
          : null,
      guest: !userId,
      personalized: profile.personalized && profile.consent,
    };
  });

const live = publicProcedure.handler(async ({ context }) => {
  const settings = await opportunitySettings(context.payload);
  return {
    enabled: Boolean(settings.liveEnabled && settings.liveStreamUrl),
    title: settings.liveTitle,
    description: settings.liveDescription ?? "",
    streamUrl:
      settings.liveEnabled && settings.liveStreamUrl
        ? canonicalize(settings.liveStreamUrl)
        : null,
  };
});

const activeWhere = (): Where => ({
  and: [
    { status: { equals: "published" } },
    { "source.status": { equals: "approved" } },
    {
      or: [
        { deadline: { exists: false } },
        { deadline: { greater_than: new Date().toISOString() } },
      ],
    },
  ],
});

const insights = protectedNoGuestProcedure.handler(async ({ context }) => {
  const [profile, interests] = await Promise.all([
    profileFor(context.payload, context.user.id),
    catalog(context.payload),
  ]);
  const signals = await signalsFor(context.payload, context.user.id, profile);
  const learned = learnedInterests(signals);
  const label = (key: string) =>
    interests.find((i) => i.key === key)?.label ?? key;
  const strongest = [
    ...new Set([...profile.interests, ...Object.keys(learned)]),
  ]
    .sort(
      (a, b) =>
        (profile.interests.includes(b) ? 60 : 0) +
        (learned[b] ?? 0) -
        ((profile.interests.includes(a) ? 60 : 0) + (learned[a] ?? 0))
    )
    .map((key) => ({
      key,
      label: label(key),
      selected: profile.interests.includes(key),
    }));
  const emerging = Object.entries(learned)
    .filter(([key, score]) => score >= 5 && !profile.interests.includes(key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => ({
      key,
      label: label(key),
      reason: "An interest emerging from content you chose to engage with",
    }));
  const trending = await context.payload.find({
    collection: "opportunities",
    where: activeWhere(),
    sort: "-popularity",
    limit: 10,
    depth: 1,
  });
  return {
    strongest,
    emerging,
    activityCount: signals.length,
    personalizationEnabled: profile.personalized && profile.consent,
    trending: trending.docs.map(contentFromDoc),
  };
});

const guidance = protectedNoGuestProcedure
  .use(
    createRateLimitMiddleware({
      name: "opportunity-guidance",
      maxRequests: 15,
      window: 60_000,
    })
  )
  .input(z.object({ goals: z.string().trim().min(1).max(500) }))
  .handler(async ({ context, input }) => {
    const profile = await profileFor(context.payload, context.user.id);
    const [signals, result, settings] = await Promise.all([
      signalsFor(context.payload, context.user.id, profile),
      context.payload.find({
        collection: "opportunities",
        where: activeWhere(),
        sort: "-publishedAt",
        limit: 200,
        depth: 1,
      }),
      opportunitySettings(context.payload),
    ]);
    const terms = input.goals
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 3);
    const ranked = rankOpportunities(
      result.docs.map(contentFromDoc),
      profile,
      signals,
      Date.now(),
      settings
    );
    const matching = ranked.filter((item) =>
      terms.some((term) =>
        `${item.title} ${item.summary} ${item.category} ${item.location} ${item.preferences.join(" ")}`
          .toLowerCase()
          .includes(term)
      )
    );
    const suggestions = (matching.length ? matching : ranked).slice(0, 5);
    return {
      answer: suggestions.length
        ? matching.length
          ? "These published opportunities relate to your goals and current preferences. Review each provider's requirements before applying."
          : "No exact goal match was found. These current recommendations may help you explore other options."
        : "No current opportunities are available for these goals. Try again after more approved content is published.",
      suggestions,
      disclaimer:
        "Source-grounded discovery guidance, not an eligibility assessment, professional advice, or a generative AI response.",
    };
  });

const detail = publicProcedure
  .input(idInput)
  .handler(async ({ context, input }) =>
    contentFromDoc(await opportunityDoc(context.payload, input.id))
  );

const feedback = protectedNoGuestProcedure
  .use(
    createRateLimitMiddleware({
      name: "opportunity-feedback",
      maxRequests: 60,
      window: 60_000,
    })
  )
  .input(idInput.extend({ action: actionSchema, eventId: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    const profile = await profileFor(context.payload, context.user.id);
    if (!(profile.consent && profile.personalized)) {
      return { recorded: false };
    }
    const doc = await opportunityDoc(context.payload, input.id);
    const eventKey = `${context.user.id}:${input.eventId}`;
    const existing = await context.payload.find({
      collection: "opportunity-events",
      where: { eventKey: { equals: eventKey } },
      limit: 1,
    });
    if (existing.docs.length) {
      return { recorded: false };
    }
    await context.payload.create({
      collection: "opportunity-events",
      data: {
        user: context.user.id,
        opportunity: doc.id,
        category: doc.category,
        action: input.action,
        eventKey,
      },
    });
    return { recorded: true };
  });

const saves = protectedNoGuestProcedure.handler(async ({ context }) => {
  const result = await context.payload.find({
    collection: "saved-opportunities",
    where: { user: { equals: context.user.id } },
    limit: 100,
    sort: "-createdAt",
    depth: 2,
  });
  return result.docs.flatMap((saved) => {
    if (typeof saved.opportunity !== "object" || !saved.opportunity) {
      return [];
    }
    return [
      {
        ...contentFromDoc(saved.opportunity),
        savedId: saved.id,
        trackingStatus: saved.status,
        reminderAt: saved.reminderAt ?? null,
      },
    ];
  });
});

const save = protectedNoGuestProcedure
  .input(idInput.extend({ saved: z.boolean() }))
  .handler(async ({ context, input }) => {
    const saveKey = `${context.user.id}:${input.id}`;
    if (!input.saved) {
      await context.payload.delete({
        collection: "saved-opportunities",
        where: {
          and: [
            { saveKey: { equals: saveKey } },
            { user: { equals: context.user.id } },
          ],
        },
      });
      return { saved: false };
    }
    await opportunityDoc(context.payload, input.id);
    const existing = await context.payload.find({
      collection: "saved-opportunities",
      where: { saveKey: { equals: saveKey } },
      limit: 1,
    });
    if (!existing.docs.length) {
      await context.payload.create({
        collection: "saved-opportunities",
        data: {
          user: context.user.id,
          opportunity: input.id,
          saveKey,
          status: "Interested",
        },
      });
    }
    return { saved: true };
  });

const updateSaved = protectedNoGuestProcedure
  .input(
    idInput.extend({
      status: z
        .enum([
          "Interested",
          "Planning to Apply",
          "In Progress",
          "Submitted",
          "Closed",
        ])
        .optional(),
      reminderDays: z
        .union([z.literal(1), z.literal(3), z.literal(7), z.null()])
        .optional(),
    })
  )
  .handler(async ({ context, input }) => {
    const result = await context.payload.find({
      collection: "saved-opportunities",
      where: {
        and: [
          { user: { equals: context.user.id } },
          { opportunity: { equals: input.id } },
        ],
      },
      limit: 1,
    });
    const saved = result.docs[0];
    if (!saved) {
      throw new ORPCError("NOT_FOUND", {
        message: "Save this opportunity first",
      });
    }
    const doc = await opportunityDoc(context.payload, input.id);
    let reminderAt = saved.reminderAt;
    if (input.reminderDays !== undefined) {
      reminderAt =
        input.reminderDays === null
          ? null
          : doc.deadline
            ? new Date(
                Date.parse(doc.deadline) - input.reminderDays * 86_400_000
              ).toISOString()
            : null;
      if (
        input.reminderDays !== null &&
        (!reminderAt || Date.parse(reminderAt) <= Date.now())
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Choose a reminder time before the deadline and after now",
        });
      }
    }
    await context.payload.update({
      collection: "saved-opportunities",
      id: saved.id,
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.reminderDays === undefined
          ? {}
          : { reminderAt, reminderSentAt: null }),
      },
    });
    return { updated: true };
  });

const report = protectedNoGuestProcedure
  .use(
    createRateLimitMiddleware({
      name: "opportunity-report",
      maxRequests: 5,
      window: 60_000,
    })
  )
  .input(
    idInput.extend({
      reason: z.enum([
        "Expired opportunity",
        "Incorrect information",
        "Suspicious or misleading content",
        "Broken link",
        "Duplicate content",
        "Other",
      ]),
      details: z.string().max(1000).default(""),
    })
  )
  .handler(async ({ context, input }) => {
    await opportunityDoc(context.payload, input.id);
    await context.payload.create({
      collection: "opportunity-reports",
      data: {
        user: context.user.id,
        opportunity: input.id,
        reason: input.reason,
        details: input.details,
        status: "pending",
      },
    });
    return { message: "Thanks. We'll review this." };
  });

/** Grounded helper: never invent deadlines, eligibility or application instructions. */
const assistant = protectedNoGuestProcedure
  .use(
    createRateLimitMiddleware({
      name: "opportunity-assistant",
      maxRequests: 15,
      window: 60_000,
    })
  )
  .input(idInput.extend({ question: z.string().trim().min(1).max(500) }))
  .handler(async ({ context, input }) => {
    const doc = contentFromDoc(await opportunityDoc(context.payload, input.id));
    const question = input.question.toLowerCase();
    const answer = /deadline|close|when/.test(question)
      ? doc.deadline
        ? `The listed deadline is ${new Date(doc.deadline).toUTCString()}.`
        : "This source does not list a deadline."
      : /eligib|qualif|apply|requirement/.test(question)
        ? "NewsSpend cannot determine your eligibility. Check the published requirements on the official source."
        : `${doc.summary}\n${Object.entries(doc.details)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n")}`;
    return {
      answer,
      source: canonicalize(doc.canonicalUrl),
      disclaimer:
        "Based on the stored source information, not an eligibility assessment. Verify details with the provider.",
      responseId: randomUUID(),
    };
  });

export const forYouRouter = {
  catalog: catalogGet,
  profile: profileGet,
  updateProfile: profileUpdate,
  feed,
  detail,
  feedback,
  saves,
  save,
  updateSaved,
  report,
  assistant,
  live,
  insights,
  guidance,
};
