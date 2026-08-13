import {
  CONSECUTIVE_ELIGIBILITY,
  CONSECUTIVE_GIVEAWAYS_REQUIRED,
  type EngagementType,
  PRIMARY_ELIGIBILITY,
  PRIZE_TIERS,
  type PrizeTier,
} from "@news-spend-media/payload/collections/giveaway";
import { loadDrawHistories } from "@news-spend-media/payload/lib/giveaway/drawHistory";
import {
  evaluateEligibility,
  type Participation,
} from "@news-spend-media/payload/lib/giveaway/eligibility";
import {
  evaluateFairness,
  type UserDrawHistory,
} from "@news-spend-media/payload/lib/giveaway/fairness";
import {
  activities,
  users,
} from "@news-spend-media/payload/payload-generated-schema";
import type { Giveaway } from "@news-spend-media/payload/types";
import { eq, sql } from "@payloadcms/db-postgres/drizzle";
import type { BasePayload, Where } from "payload";
import z from "zod";

import {
  protectedNoGuestProcedure,
  protectedProcedure,
  publicProcedure,
} from "../index";
import { createRateLimitMiddleware } from "../lib/ratelimit";

/**
 * Upper bound on a single purchase. Not a business rule — the quantity is
 * multiplied by the ticket price to produce a points debit, so an absurd
 * value is worth rejecting outright rather than reasoning about.
 */
const MAX_TICKETS_PER_PURCHASE = 1000;

/**
 * Which app surfaces produce which kind of engagement (spec §7, §8).
 *
 * A Boost is a Connect Brand advertisement watched to completion; a Featured
 * Offer is an item on the Lucky App Wall. Checking the placement stops a
 * Lucky App Wall item being submitted as a Boost, which would otherwise be an
 * easy way to satisfy Tier 1's three-boost requirement from a single surface.
 */
const ENGAGEMENT_PLACEMENTS: Record<EngagementType, readonly string[]> = {
  boost: ["connect-brand-video", "connect-brands-tab"],
  featured_offer: ["lucky-app-wall"],
};

const ENGAGEMENT_LABELS: Record<EngagementType, string> = {
  boost: "Boost Your Luck",
  featured_offer: "Featured Offer",
};

/**
 * Engagements cost nothing, so without a limit a client could record enough
 * of them to reach Tier 1 in seconds. The per-item rule below is the real
 * defence; this is the cheap one that stops the attempt.
 */
const engagementRateLimit = createRateLimitMiddleware({
  maxRequests: 30,
  window: 60_000,
});

const purchaseRateLimit = createRateLimitMiddleware({
  maxRequests: 10,
  window: 60_000,
});

type ErrorFactory = {
  NOT_FOUND: (args: { message: string }) => Error;
  CONFLICT: (args: { message: string }) => Error;
};

/**
 * The giveaway currently accepting participation.
 *
 * Only a giveaway that is `active` and inside its own window takes tickets or
 * engagements. Once the draw begins the candidate pool is locked (§12), so
 * anything recorded afterwards could never have counted anyway — better to
 * refuse it than to store a row that silently does nothing.
 */
async function openGiveaway(
  payload: BasePayload,
  errors: ErrorFactory
): Promise<Giveaway> {
  const found = await payload.find({
    collection: "giveaways",
    where: { status: { equals: "active" } },
    limit: 1,
    pagination: false,
    depth: 0,
  });

  const giveaway = found.docs[0];
  if (!giveaway) {
    throw errors.NOT_FOUND({
      message: "There is no giveaway running at the moment.",
    });
  }

  const now = Date.now();

  if (new Date(giveaway.startDate).getTime() > now) {
    throw errors.CONFLICT({
      message: "This giveaway has not opened yet.",
    });
  }

  if (new Date(giveaway.endDate).getTime() <= now) {
    throw errors.CONFLICT({
      message: "This giveaway has closed and is waiting for its draw.",
    });
  }

  return giveaway;
}

/**
 * Everything the eligibility rules need about one user in one giveaway.
 *
 * Tickets are summed by quantity rather than counted by row — §6 aggregates
 * every valid purchase in the period, and one purchase of ten tickets has to
 * weigh the same as ten purchases of one.
 */
async function loadParticipation(
  payload: BasePayload,
  giveawayId: string,
  userId: string
): Promise<Participation> {
  const scope: Where[] = [
    { giveaway: { equals: giveawayId } },
    { user: { equals: userId } },
  ];

  const [tickets, engagements, streaks] = await Promise.all([
    payload.find({
      collection: "giveaway-tickets",
      where: { and: [...scope, { status: { equals: "valid" } }] },
      pagination: false,
      depth: 0,
    }),
    payload.find({
      collection: "giveaway-engagements",
      where: { and: [...scope, { completionStatus: { equals: "completed" } }] },
      pagination: false,
      depth: 0,
    }),
    payload.find({
      collection: "giveaway-streaks",
      where: { user: { equals: userId } },
      pagination: false,
      depth: 0,
    }),
  ]);

  const participation: Participation = {
    userId,
    validTickets: tickets.docs.reduce(
      (sum, ticket) => sum + (ticket.quantity ?? 0),
      0
    ),
    boosts: engagements.docs.filter((row) => row.type === "boost").length,
    featuredOffers: engagements.docs.filter(
      (row) => row.type === "featured_offer"
    ).length,
    streaks: {},
  };

  for (const streak of streaks.docs) {
    if (streak.tier) {
      participation.streaks[streak.tier as PrizeTier] =
        streak.consecutiveCount ?? 0;
    }
  }

  return participation;
}

const NO_HISTORY: UserDrawHistory = { outcomes: [] };

/**
 * A user's participation this round together with their history, which is
 * everything the tier summary needs. Both write endpoints echo the caller's
 * new standing, so they load the same pair the progress endpoint does — a
 * summary that omitted the cooldowns would contradict it.
 */
async function loadStanding(
  payload: BasePayload,
  giveaway: Giveaway,
  userId: string
) {
  const [participation, histories] = await Promise.all([
    loadParticipation(payload, giveaway.id, userId),
    loadDrawHistories(payload, { before: giveaway.endDate, userId }),
  ]);

  return { participation, history: histories.get(userId) };
}

/**
 * Per-tier standing, shaped for the participation screen.
 *
 * Two separate questions are answered per tier, and keeping them apart matters
 * for what the app can honestly say. `requirementsMet` is whether the user has
 * done enough this round — the thing they can act on. `canWin` also accounts
 * for the §22 fairness cooldowns, which no amount of buying or boosting will
 * change: a recent Tier 1 winner is barred from Tier 1 whatever they do.
 *
 * Collapsing the two would mean either promising a tier the draw will exclude
 * them from, or showing an unmet requirement they cannot fix.
 */
function summariseTiers(
  participation: Participation,
  history: UserDrawHistory = NO_HISTORY
) {
  return PRIZE_TIERS.map((tier) => {
    const fairness = evaluateFairness(tier, history);
    const loyaltyWaiver = fairness.eligible && fairness.loyaltyWaiver;
    const verdict = evaluateEligibility(tier, participation, loyaltyWaiver);

    return {
      tier,
      /** Has this user done enough this round? */
      requirementsMet: verdict.eligible,
      /** Will the draw actually consider them? Requirements *and* cooldowns. */
      canWin: verdict.eligible && fairness.eligible,
      path: verdict.eligible ? verdict.path : null,
      cooldown: fairness.eligible
        ? null
        : { rule: fairness.rule, reason: fairness.reason },
      /** §22.4 — the Featured Offer requirement is waived this round. */
      loyaltyWaiver,
      requirements: {
        primary: PRIMARY_ELIGIBILITY[tier],
        consecutive: CONSECUTIVE_ELIGIBILITY[tier],
        consecutiveGiveawaysRequired: CONSECUTIVE_GIVEAWAYS_REQUIRED,
      },
      consecutiveGiveawaysMet: participation.streaks[tier] ?? 0,
    };
  });
}

// --- Procedures ---

/** The giveaway currently open, or null. Safe to call when signed out. */
const current = publicProcedure.handler(async ({ context }) => {
  const { payload } = context;

  const found = await payload.find({
    collection: "giveaways",
    where: { status: { equals: "active" } },
    limit: 1,
    pagination: false,
    depth: 0,
  });

  const giveaway = found.docs[0];
  if (!giveaway) {
    return null;
  }

  return {
    id: giveaway.id,
    name: giveaway.name,
    description: giveaway.description ?? null,
    startDate: giveaway.startDate,
    endDate: giveaway.endDate,
    ticketPrice: giveaway.ticketPrice,
    minTicketsRequired: giveaway.minTicketsRequired ?? 1,
  };
});

/**
 * What the signed-in user has done in the open giveaway, and where that
 * leaves them for each tier.
 *
 * The fairness cooldowns are read from the same history reconstruction the
 * draw itself uses, so what the app shows and what the draw does cannot drift
 * apart — there is one implementation, not two.
 */
const progress = protectedProcedure.handler(async ({ context, errors }) => {
  const { payload, user } = context;
  const giveaway = await openGiveaway(payload, errors);

  const { participation, history } = await loadStanding(
    payload,
    giveaway,
    user.id
  );

  return {
    giveawayId: giveaway.id,
    endDate: giveaway.endDate,
    ticketPrice: giveaway.ticketPrice,
    minTicketsRequired: giveaway.minTicketsRequired ?? 1,
    participation: {
      validTickets: participation.validTickets,
      boosts: participation.boosts,
      featuredOffers: participation.featuredOffers,
    },
    tiers: summariseTiers(participation, history),
  };
});

export const BuyTicketsInput = z.object({
  quantity: z
    .number()
    .int("Ticket quantity must be a whole number.")
    .min(1, "You must buy at least one ticket.")
    .max(
      MAX_TICKETS_PER_PURCHASE,
      `You cannot buy more than ${MAX_TICKETS_PER_PURCHASE} tickets at once.`
    ),
  paymentReference: z.string().max(200).optional(),
});

/**
 * Buy tickets for the open giveaway (spec §6).
 *
 * One row per purchase, never an upsert. The legacy lottery collapsed every
 * purchase by a user into a single row, which made the ticket count decorative
 * — the draw rolled once per user however many tickets they had bought. Here
 * each row is an independent weighted entry, so buying more tickets genuinely
 * improves the odds.
 *
 * The points debit follows the same shape as the lottery's: balance read and
 * write inside one transaction that first takes a row lock on the user, so two
 * concurrent purchases cannot both pass the check. The debit commits before
 * the tickets exist, and is refunded if creating them fails — the reverse
 * order would hand out tickets nobody paid for.
 */
const buyTickets = protectedNoGuestProcedure
  .use(purchaseRateLimit)
  .input(BuyTicketsInput)
  .handler(async ({ input, context, errors }) => {
    const { quantity, paymentReference } = input;
    const { user, payload } = context;
    const db = payload.db.drizzle;

    const giveaway = await openGiveaway(payload, errors);

    const minimum = giveaway.minTicketsRequired ?? 1;
    if (quantity < minimum) {
      throw errors.BAD_REQUEST({
        message: `This giveaway has a minimum of ${minimum} ticket${minimum === 1 ? "" : "s"} per purchase.`,
      });
    }

    const unitPrice = giveaway.ticketPrice ?? 0;
    const cost = quantity * unitPrice;

    await db.transaction(async (tx: typeof db) => {
      await tx.execute(
        sql`SELECT 1 FROM ${users} WHERE ${users.id} = ${user.id} FOR UPDATE`
      );

      const balanceRows = await tx
        .select({
          totalPoints: sql`COALESCE(SUM(${activities.point}), 0)`.mapWith(
            Number
          ),
        })
        .from(activities)
        .where(eq(activities.user, user.id));

      const userPoints = balanceRows[0]?.totalPoints ?? 0;

      if (userPoints < cost) {
        throw errors.BAD_REQUEST({
          message: `Not enough points. ${quantity} ticket${quantity === 1 ? "" : "s"} costs ${cost} points and you have ${userPoints}.`,
        });
      }

      await tx.insert(activities).values({
        user: user.id,
        type: "point",
        action: "ticketPurchase",
        point: -cost,
        description: `Giveaway ticket purchase — ${giveaway.name}`,
      });
    });

    try {
      const ticket = await payload.create({
        collection: "giveaway-tickets",
        data: {
          giveaway: giveaway.id,
          user: user.id,
          quantity,
          unitPrice,
          status: "valid",
          paymentReference,
          purchasedAt: new Date().toISOString(),
        },
      });

      const { participation, history } = await loadStanding(
        payload,
        giveaway,
        user.id
      );

      return {
        ticketId: ticket.id,
        quantity,
        pointsSpent: cost,
        validTickets: participation.validTickets,
        tiers: summariseTiers(participation, history),
      };
    } catch (error) {
      // The points are already gone. Put them back rather than leave the user
      // charged for tickets they never received.
      await db
        .insert(activities)
        .values({
          user: user.id,
          type: "point",
          action: "ticketPurchase",
          point: cost,
          description: "Refund — giveaway ticket purchase failed",
        })
        .catch((refundError: unknown) => {
          payload.logger.error(
            { err: refundError, user: user.id, cost },
            "[giveaway] failed to refund points after a failed ticket purchase"
          );
        });

      throw error;
    }
  });

export const RecordEngagementInput = z.object({
  type: z.enum(["boost", "featured_offer"]),
  /**
   * The partner item engaged with. Required, not optional: §7 and §8 both
   * mandate recording the interaction's identity, and without it there is no
   * way to tell a second genuine engagement from the same one replayed.
   */
  contentId: z.string().min(1, "The item engaged with is required."),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Record a completed Boost Your Luck interaction or Featured Offer
 * (spec §7, §8).
 *
 * Neither creates a draw entry — both only contribute towards Tier 1 and
 * Tier 2 eligibility, which is why nothing here touches ticket counts.
 *
 * Three rules guard it. The user must already hold a valid ticket, because
 * engagement without participation is not participation. The item's placement
 * must match the kind of engagement claimed. And one partner item counts once
 * per giveaway per user — re-watching the same advertisement is not three
 * boosts, and without that rule Tier 1 is reachable from a single item.
 */
const recordEngagement = protectedNoGuestProcedure
  .use(engagementRateLimit)
  .input(RecordEngagementInput)
  .handler(async ({ input, context, errors }) => {
    const { type, contentId, metadata } = input;
    const { user, payload } = context;

    const giveaway = await openGiveaway(payload, errors);

    const tickets = await payload.find({
      collection: "giveaway-tickets",
      where: {
        and: [
          { giveaway: { equals: giveaway.id } },
          { user: { equals: user.id } },
          { status: { equals: "valid" } },
        ],
      },
      limit: 1,
      pagination: false,
      depth: 0,
    });

    if (tickets.docs.length === 0) {
      throw errors.FORBIDDEN({
        message: `Buy a ticket before completing a ${ENGAGEMENT_LABELS[type]}.`,
      });
    }

    const content = await payload
      .findByID({ collection: "partner-content", id: contentId, depth: 0 })
      .catch(() => null);

    if (!content) {
      throw errors.NOT_FOUND({ message: "That item no longer exists." });
    }

    const placements = (content.placements ?? []) as string[];
    const allowed = ENGAGEMENT_PLACEMENTS[type];

    if (!placements.some((placement) => allowed.includes(placement))) {
      throw errors.BAD_REQUEST({
        message: `That item does not count towards ${ENGAGEMENT_LABELS[type]}.`,
      });
    }

    const existing = await payload.find({
      collection: "giveaway-engagements",
      where: {
        and: [
          { giveaway: { equals: giveaway.id } },
          { user: { equals: user.id } },
          { type: { equals: type } },
          { content: { equals: contentId } },
          { completionStatus: { equals: "completed" } },
        ],
      },
      limit: 1,
      pagination: false,
      depth: 0,
    });

    if (existing.docs.length > 0) {
      throw errors.CONFLICT({
        message: `You have already completed this ${ENGAGEMENT_LABELS[type]}.`,
      });
    }

    const engagement = await payload.create({
      collection: "giveaway-engagements",
      data: {
        giveaway: giveaway.id,
        user: user.id,
        type,
        content: contentId,
        completionStatus: "completed",
        completedAt: new Date().toISOString(),
        metadata: metadata ?? null,
      },
    });

    const { participation, history } = await loadStanding(
      payload,
      giveaway,
      user.id
    );

    return {
      engagementId: engagement.id,
      type,
      boosts: participation.boosts,
      featuredOffers: participation.featuredOffers,
      tiers: summariseTiers(participation, history),
    };
  });

export const giveawayRouter = {
  current,
  progress,
  buyTickets,
  recordEngagement,
};
