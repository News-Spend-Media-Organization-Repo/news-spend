import type { BasePayload } from "payload";
import {
  type AuditEventType,
  FAIRNESS_LOOKBACK_DRAWS,
  type GiveawayStatus,
  LOCKED_GIVEAWAY_STATUSES,
  type PrizeTier,
  TIER_PROCESSING_ORDER,
} from "../../collections/giveaway/constants";
import type { Giveaway } from "../../payload-types";
import {
  evaluateEligibility,
  maxTierWinners,
  nextStreakValue,
  type Participation,
} from "./eligibility";
import {
  type DrawOutcome,
  evaluateFairness,
  type UserDrawHistory,
} from "./fairness";
import { createRng, generateSeed, weightedPick } from "./random";

export class GiveawayEngineError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "GiveawayEngineError";
  }
}

type UserKey = string;

/** A valid ticket purchase, used as a weighted entry in the draw. */
type TicketEntry = {
  ticketId: string;
  userKey: UserKey;
  quantity: number;
};

/** A prize selected for this giveaway, with live unit accounting. */
type PoolPrize = {
  rowId: string;
  prizeId: string;
  prizeName: string;
  tier: PrizeTier;
  maxUnits: number;
  unitsAwarded: number;
};

/** A persisted consecutive-giveaway counter, indexed for the draw. */
type StreakRow = {
  id: string;
  userKey: UserKey;
  tier: PrizeTier;
  consecutiveCount: number;
  /** Already advanced by this giveaway — guards double-counting on resume. */
  alreadyEvaluated: boolean;
};

/** The percentage fields, read explicitly so the typed doc stays typed. */
type TierPercentages = Pick<
  Giveaway,
  "tier1WinnerPercentage" | "tier2WinnerPercentage" | "tier3WinnerPercentage"
>;

export type TierOutcome = {
  tier: PrizeTier;
  winnerPercentage: number;
  candidatePoolSize: number;
  maxWinnersByPercentage: number;
  unitsAvailable: number;
  effectiveCap: number;
  /** True when this tier had already completed and was replayed from records. */
  skipped?: boolean;
  winners: {
    userKey: UserKey;
    ticketId: string;
    prizeId: string;
    prizeName: string;
  }[];
};

export type DrawResult = {
  giveawayId: string;
  seed: string;
  dryRun: boolean;
  totalValidParticipants: number;
  totalWinners: number;
  tiers: TierOutcome[];
};

export type RunDrawOptions = {
  /** Compute the full draw without persisting anything. */
  dryRun?: boolean;
  /** Replay a previous draw by supplying its recorded seed. */
  seed?: string;
  /** Run even if the countdown has not ended. Intended for testing. */
  ignoreEndDate?: boolean;
  /**
   * Continue a draw that previously failed part-way through (spec §19). This is
   * the "explicit administrative authorization" the spec requires, so callers
   * must gate it behind an admin role — the engine will not set it itself.
   *
   * A resumed draw reuses the original seed and participant snapshot, skips
   * tiers that already completed, and treats existing winners as ineligible.
   * There is deliberately no destructive restart: winner records and audit
   * records are immutable under §17, so a partial draw can only be continued.
   */
  resume?: boolean;
};

/**
 * The giveaway draw engine (spec §12).
 *
 * For each tier in order: build the candidate pool, select winners at random
 * from it, allocate prizes, then remove every winner from all remaining pools.
 *
 * Winner selection is capped at the number of prize units actually available,
 * so a selected winner always receives a prize — there is no
 * selected-but-unallocated state.
 */
export class GiveawayEngine {
  private readonly payload: BasePayload;

  constructor(payload: BasePayload) {
    this.payload = payload;
  }

  async runDraw(
    giveawayId: string,
    options: RunDrawOptions = {}
  ): Promise<DrawResult> {
    const dryRun = options.dryRun ?? false;

    const giveaway = await this.payload.findByID({
      collection: "giveaways",
      id: giveawayId,
      depth: 0,
    });

    if (!giveaway) {
      throw new GiveawayEngineError("Giveaway not found", "GIVEAWAY_NOT_FOUND");
    }

    const resume = options.resume ?? false;

    const validation = await this.validateDraw(giveawayId, {
      ignoreEndDate: options.ignoreEndDate ?? false,
      resume,
    });
    if (!validation.valid) {
      throw new GiveawayEngineError(
        `Draw cannot start: ${validation.errors.join("; ")}`,
        "DRAW_VALIDATION_FAILED",
        validation.errors
      );
    }

    // A resumed draw must continue the *same* draw, so it reuses the recorded
    // seed. A fresh seed would produce different winners for the tiers that
    // have not run yet, which would make the audit trail incoherent.
    if (resume && !(options.seed || giveaway.drawSeed)) {
      throw new GiveawayEngineError(
        "Cannot resume: the giveaway has no recorded draw seed.",
        "RESUME_WITHOUT_SEED"
      );
    }

    const seed =
      options.seed ?? (resume ? (giveaway.drawSeed as string) : generateSeed());

    if (!dryRun) {
      await this.markDrawing(giveawayId, seed, resume);
    }

    try {
      const result = await this.executeDraw(giveawayId, seed, dryRun, resume);

      if (!dryRun) {
        await this.markCompleted(giveawayId, result);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (!dryRun) {
        // Preserve all completed draw records and stop (spec §19).
        await this.markFailed(giveawayId, message);
      }

      throw error;
    }
  }

  private async markDrawing(giveawayId: string, seed: string, resume: boolean) {
    await this.payload.update({
      collection: "giveaways",
      id: giveawayId,
      data: {
        status: "drawing",
        drawSeed: seed,
        drawError: null,
        // A resume keeps the original start time — it is the same draw.
        ...(resume ? {} : { drawStartedAt: new Date().toISOString() }),
      },
    });

    await this.audit(
      giveawayId,
      resume ? "draw_resumed" : "draw_started",
      resume ? "Draw resumed after failure" : "Draw started",
      { seed }
    );
  }

  private async markCompleted(giveawayId: string, result: DrawResult) {
    await this.payload.update({
      collection: "giveaways",
      id: giveawayId,
      data: {
        status: "completed",
        drawCompletedAt: new Date().toISOString(),
      },
    });

    await this.audit(giveawayId, "draw_completed", "Draw completed", {
      totalWinners: result.totalWinners,
      totalValidParticipants: result.totalValidParticipants,
    });
  }

  private async markFailed(giveawayId: string, message: string) {
    await this.payload.update({
      collection: "giveaways",
      id: giveawayId,
      data: { status: "failed", drawError: message },
    });

    await this.audit(giveawayId, "draw_error", "Draw failed", { message });
  }

  /** Pre-draw configuration checks (spec §19). */
  async validateDraw(
    giveawayId: string,
    {
      ignoreEndDate = false,
      resume = false,
    }: { ignoreEndDate?: boolean; resume?: boolean } = {}
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    const giveaway = await this.payload.findByID({
      collection: "giveaways",
      id: giveawayId,
      depth: 0,
    });

    if (!giveaway) {
      return { valid: false, errors: ["Giveaway not found."] };
    }

    errors.push(...checkDrawableStatus(giveaway, { ignoreEndDate, resume }));

    const prizeRows = await this.payload.find({
      collection: "giveaway-prizes",
      where: { giveaway: { equals: giveawayId } },
      pagination: false,
      depth: 0,
    });

    if (prizeRows.docs.length === 0) {
      errors.push("No prizes have been configured for this giveaway.");
    }

    for (const row of prizeRows.docs) {
      if (
        row.maxUnits === null ||
        row.maxUnits === undefined ||
        !Number.isInteger(row.maxUnits) ||
        row.maxUnits < 1
      ) {
        errors.push(
          `Prize row ${row.id} does not have a valid Maximum Units value.`
        );
      }
    }

    // Every enabled tier must have both a percentage and a non-empty pool.
    for (const tier of TIER_PROCESSING_ORDER) {
      const percentage = this.tierPercentage(giveaway, tier);

      if (percentage === null || percentage === undefined) {
        errors.push(`Winner Distribution is not configured for ${tier}.`);
        continue;
      }

      if (percentage > 0) {
        const tierPrizes = prizeRows.docs.filter((row) => row.tier === tier);
        if (tierPrizes.length === 0) {
          errors.push(
            `${tier} is enabled (${percentage}%) but its Prize Pool is empty.`
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private async executeDraw(
    giveawayId: string,
    seed: string,
    dryRun: boolean,
    resume = false
  ): Promise<DrawResult> {
    const giveaway = await this.payload.findByID({
      collection: "giveaways",
      id: giveawayId,
      depth: 0,
    });

    const { participation, ticketEntries } =
      await this.loadParticipation(giveawayId);

    /**
     * Disqualified and duplicate accounts come out before anything else, so
     * they are absent from Total Valid Participants too (§22.5, §22.6) — they
     * were never legitimate participants, and leaving them in the denominator
     * would inflate every tier's winner cap.
     */
    const accountFlags = await this.loadAccountFlags();
    for (const userKey of accountFlags.excluded) {
      if (participation.delete(userKey) && !(dryRun || resume)) {
        await this.audit(
          giveawayId,
          "account_excluded",
          `Account excluded from the draw: ${accountFlags.reasons.get(userKey) ?? "flagged"}`,
          { reason: accountFlags.reasons.get(userKey) },
          undefined,
          userKey
        );
      }
    }

    const histories = await this.loadDrawHistories(giveaway);

    // Total Valid Participants: unique users holding at least one valid ticket,
    // captured once and held constant for the whole draw (spec §3). A resume
    // reuses the original snapshot rather than recounting — tickets may have
    // been invalidated since, and §3 requires the value not to change mid-draw.
    const totalValidParticipants = resume
      ? (giveaway.totalValidParticipants ?? participation.size)
      : participation.size;

    if (!(dryRun || resume)) {
      await this.payload.update({
        collection: "giveaways",
        id: giveawayId,
        data: { totalValidParticipants },
      });
      await this.audit(
        giveawayId,
        "participants_snapshot",
        `Total Valid Participants captured: ${totalValidParticipants}`,
        { totalValidParticipants, seed }
      );
    }

    // Unit counters are already persisted, so a resumed draw picks up the
    // correct remaining units with no extra work.
    const prizePool = await this.loadPrizePool(giveawayId);

    const { winnersByTier, completedTiers } = resume
      ? await this.loadPriorProgress(giveawayId)
      : {
          winnersByTier: new Map<PrizeTier, TierOutcome["winners"]>(),
          completedTiers: new Set<PrizeTier>(),
        };

    /** Users already holding a prize — excluded from all remaining pools (§13). */
    const winnersSoFar = new Set<UserKey>();
    for (const winners of winnersByTier.values()) {
      for (const winner of winners) {
        winnersSoFar.add(winner.userKey);
      }
    }

    const tiers: TierOutcome[] = [];

    for (const tier of TIER_PROCESSING_ORDER) {
      const winnerPercentage = this.tierPercentage(giveaway, tier) ?? 0;

      // A tier that already completed is replayed from its persisted records,
      // never re-drawn — that is what stops a resume awarding twice.
      if (completedTiers.has(tier)) {
        const winners = winnersByTier.get(tier) ?? [];
        tiers.push({
          tier,
          winnerPercentage,
          candidatePoolSize: 0,
          maxWinnersByPercentage: maxTierWinners(
            totalValidParticipants,
            winnerPercentage
          ),
          unitsAvailable: 0,
          effectiveCap: winners.length,
          skipped: true,
          winners,
        });
        continue;
      }

      const outcome = await this.processTier({
        giveawayId,
        tier,
        seed,
        dryRun,
        winnerPercentage,
        totalValidParticipants,
        participation,
        ticketEntries,
        prizePool,
        winnersSoFar,
        histories,
        heldForReview: accountFlags.heldForReview,
      });
      tiers.push(outcome);
    }

    if (!dryRun) {
      await this.updateStreaks(giveawayId, participation);
    }

    return {
      giveawayId,
      seed,
      dryRun,
      totalValidParticipants,
      totalWinners: tiers.reduce((sum, t) => sum + t.winners.length, 0),
      tiers,
    };
  }

  private async processTier(args: {
    giveawayId: string;
    tier: PrizeTier;
    seed: string;
    dryRun: boolean;
    winnerPercentage: number;
    totalValidParticipants: number;
    participation: Map<UserKey, Participation>;
    ticketEntries: TicketEntry[];
    prizePool: PoolPrize[];
    winnersSoFar: Set<UserKey>;
    histories: Map<UserKey, UserDrawHistory>;
    heldForReview: Set<UserKey>;
  }): Promise<TierOutcome> {
    const {
      giveawayId,
      tier,
      seed,
      dryRun,
      winnerPercentage,
      totalValidParticipants,
      participation,
      ticketEntries,
      prizePool,
      winnersSoFar,
      histories,
      heldForReview,
    } = args;

    // Step 1 — Build the candidate pool (spec §12), applying the fairness
    // rules of §22 alongside the tier eligibility thresholds of §11.
    const { candidates, fairnessExclusions, loyaltyWaivers } =
      buildCandidatePool(tier, participation, winnersSoFar, histories);

    const tierPrizes = prizePool.filter((prize) => prize.tier === tier);
    const unitsAvailable = tierPrizes.reduce(
      (sum, prize) => sum + (prize.maxUnits - prize.unitsAwarded),
      0
    );
    const maxByPercentage = maxTierWinners(
      totalValidParticipants,
      winnerPercentage
    );

    // The system shall never select more winners than the percentage cap, the
    // available prize units, or the candidate pool size (spec §9).
    const effectiveCap = Math.min(
      maxByPercentage,
      unitsAvailable,
      candidates.size
    );

    const outcome: TierOutcome = {
      tier,
      winnerPercentage,
      candidatePoolSize: candidates.size,
      maxWinnersByPercentage: maxByPercentage,
      unitsAvailable,
      effectiveCap,
      winners: [],
    };

    if (!dryRun) {
      await this.audit(
        giveawayId,
        "candidate_pool_built",
        `${tier} candidate pool built: ${candidates.size} eligible users`,
        {
          tier,
          candidatePoolSize: candidates.size,
          maxByPercentage,
          unitsAvailable,
          effectiveCap,
        },
        tier
      );

      for (const [rule, count] of fairnessExclusions) {
        await this.audit(
          giveawayId,
          "fairness_exclusion",
          `${rule} barred ${count} user(s) from ${tier}`,
          { tier, rule, count },
          tier
        );
      }

      if (loyaltyWaivers.size > 0) {
        await this.audit(
          giveawayId,
          "loyalty_waiver_applied",
          `Featured Offer requirement waived for ${loyaltyWaivers.size} loyal user(s) in ${tier}`,
          { tier, count: loyaltyWaivers.size },
          tier
        );
      }
    }

    if (effectiveCap === 0) {
      return outcome;
    }

    const selectionRng = createRng(seed, `winners:${tier}`);
    const allocationRng = createRng(seed, `prizes:${tier}`);

    // Only entries belonging to candidates can be drawn.
    const eligibleEntries = ticketEntries.filter((entry) =>
      candidates.has(entry.userKey)
    );

    // Step 2 & 3 — Select a winner, then immediately allocate a prize to them.
    // Interleaving the two keeps unit accounting exact when a prize runs out
    // partway through, and guarantees no winner is left without a prize.
    const excluded = new Set<UserKey>();

    for (let i = 0; i < effectiveCap; i += 1) {
      const entry = weightedPick(
        eligibleEntries,
        (candidate) =>
          excluded.has(candidate.userKey) ? 0 : candidate.quantity,
        selectionRng
      );

      if (!entry) {
        break;
      }

      const prize = weightedPick(
        tierPrizes,
        (candidate) => candidate.maxUnits - candidate.unitsAwarded,
        allocationRng
      );

      if (!prize) {
        // All units in this tier are exhausted; winner selection stops (§15).
        break;
      }

      prize.unitsAwarded += 1;
      excluded.add(entry.userKey);
      winnersSoFar.add(entry.userKey);

      outcome.winners.push({
        userKey: entry.userKey,
        ticketId: entry.ticketId,
        prizeId: prize.prizeId,
        prizeName: prize.prizeName,
      });

      if (!dryRun) {
        await this.persistWinner({
          giveawayId,
          tier,
          entry,
          prize,
          participation: participation.get(entry.userKey),
          heldForReview: heldForReview.has(entry.userKey),
        });
      }
    }

    if (!dryRun) {
      await this.audit(
        giveawayId,
        "tier_completed",
        `${tier} complete: ${outcome.winners.length} winners`,
        { tier, winners: outcome.winners.length },
        tier
      );
    }

    return outcome;
  }

  /**
   * What a previous, failed attempt at this draw already did: which tiers ran
   * to completion, and who has already been awarded a prize.
   *
   * Completion is read from `tier_completed` audit records rather than inferred
   * from winner rows, because a tier can legitimately complete with zero
   * winners (empty pool, or no units left). Inferring from winners would re-run
   * those tiers.
   */
  private async loadPriorProgress(giveawayId: string): Promise<{
    winnersByTier: Map<PrizeTier, TierOutcome["winners"]>;
    completedTiers: Set<PrizeTier>;
  }> {
    const [winners, tierEvents] = await Promise.all([
      this.payload.find({
        collection: "giveaway-winners",
        where: { giveaway: { equals: giveawayId } },
        pagination: false,
        depth: 0,
      }),
      this.payload.find({
        collection: "giveaway-audit-log",
        where: {
          and: [
            { giveaway: { equals: giveawayId } },
            { eventType: { equals: "tier_completed" } },
          ],
        },
        pagination: false,
        depth: 0,
      }),
    ]);

    const winnersByTier = new Map<PrizeTier, TierOutcome["winners"]>();
    for (const winner of winners.docs) {
      const userKey = relationKey(winner.user);
      const tier = winner.tier as PrizeTier;
      if (!userKey) {
        continue;
      }
      const bucket = winnersByTier.get(tier) ?? [];
      bucket.push({
        userKey,
        ticketId: relationKey(winner.winningTicket) ?? "",
        prizeId: relationKey(winner.prize) ?? "",
        prizeName: winner.prizeName ?? "",
      });
      winnersByTier.set(tier, bucket);
    }

    const completedTiers = new Set<PrizeTier>();
    for (const event of tierEvents.docs) {
      if (event.tier) {
        completedTiers.add(event.tier as PrizeTier);
      }
    }

    return { winnersByTier, completedTiers };
  }

  /**
   * Write the winner record, decrement the prize's unit counter, and log the
   * selection, allocation and (if it just ran out) exhaustion of the prize.
   */
  private async persistWinner({
    giveawayId,
    tier,
    entry,
    prize,
    participation,
    heldForReview,
  }: {
    giveawayId: string;
    tier: PrizeTier;
    entry: TicketEntry;
    prize: PoolPrize;
    participation: Participation | undefined;
    heldForReview: boolean;
  }) {
    await this.payload.create({
      collection: "giveaway-winners",
      data: {
        giveaway: giveawayId,
        user: entry.userKey,
        tier,
        prize: prize.prizeId,
        prizeName: prize.prizeName,
        winningTicket: entry.ticketId,
        validTicketCount: participation?.validTickets ?? 0,
        boostCount: participation?.boosts ?? 0,
        featuredOfferCount: participation?.featuredOffers ?? 0,
        selectedAt: new Date().toISOString(),
        claimStatus: "unclaimed",
        // A flagged account still wins — only the payout waits (§22.8).
        fulfilmentStatus: heldForReview ? "on_hold" : "pending",
        reviewNote: heldForReview
          ? "Account flagged as suspicious. Fulfilment held pending administrator review; the draw result stands."
          : undefined,
      },
    });

    await this.payload.update({
      collection: "giveaway-prizes",
      id: prize.rowId,
      data: { unitsAwarded: prize.unitsAwarded },
    });

    const unitsRemaining = prize.maxUnits - prize.unitsAwarded;

    await this.audit(
      giveawayId,
      "winner_selected",
      `${tier} winner selected`,
      { tier, ticketId: entry.ticketId },
      tier,
      entry.userKey
    );
    await this.audit(
      giveawayId,
      "prize_allocated",
      `Allocated "${prize.prizeName}"`,
      {
        tier,
        prizeId: prize.prizeId,
        unitsAwarded: prize.unitsAwarded,
        unitsRemaining,
      },
      tier,
      entry.userKey
    );

    if (unitsRemaining === 0) {
      await this.audit(
        giveawayId,
        "prize_exhausted",
        `"${prize.prizeName}" is exhausted and removed from further allocation`,
        { tier, prizeId: prize.prizeId },
        tier
      );
    }
  }

  /**
   * Aggregate every user's valid tickets, successful boosts and successful
   * featured offers for this giveaway, plus their persisted streaks.
   */
  private async loadParticipation(giveawayId: string): Promise<{
    participation: Map<UserKey, Participation>;
    ticketEntries: TicketEntry[];
  }> {
    const { tickets, engagements, streaks } =
      await this.fetchParticipationRows(giveawayId);

    const { participation, ticketEntries } = aggregateTickets(tickets.docs);

    // Engagements only matter for users who hold a valid ticket; a user with no
    // ticket is not a participant at all.
    countEngagements(participation, engagements.docs);
    applyStreaks(participation, streaks.docs, giveawayId);

    return { participation, ticketEntries };
  }

  /**
   * Reconstruct what each user did in the previous completed giveaways, most
   * recent first (spec §22).
   *
   * Only giveaways that reached `completed` are included. That is what makes
   * §11's streak exceptions fall out for free — a round that was cancelled,
   * never published or invalidated never reaches `completed`, so it is absent
   * from the sequence rather than counting as a round the user missed.
   *
   * Nothing is stored: cooldowns and the loyalty waiver are derived from the
   * winner and ticket records that already exist, so there are no counters to
   * drift out of step with reality.
   */
  private async loadDrawHistories(
    giveaway: Giveaway
  ): Promise<Map<UserKey, UserDrawHistory>> {
    const priorGiveaways = await this.payload.find({
      collection: "giveaways",
      where: {
        and: [
          { status: { equals: "completed" } },
          { endDate: { less_than: giveaway.endDate } },
        ],
      },
      sort: "-endDate",
      limit: FAIRNESS_LOOKBACK_DRAWS,
      pagination: false,
      depth: 0,
    });

    const histories = new Map<UserKey, UserDrawHistory>();
    if (priorGiveaways.docs.length === 0) {
      return histories;
    }

    const priorIds = priorGiveaways.docs.map((g) => g.id);

    const [winners, tickets] = await Promise.all([
      this.payload.find({
        collection: "giveaway-winners",
        where: { giveaway: { in: priorIds } },
        pagination: false,
        depth: 0,
      }),
      this.payload.find({
        collection: "giveaway-tickets",
        where: {
          and: [
            { giveaway: { in: priorIds } },
            { status: { equals: "valid" } },
          ],
        },
        pagination: false,
        depth: 0,
      }),
    ]);

    // `${giveawayId}:${userKey}` -> tier won / took part
    const wonAt = new Map<string, PrizeTier>();
    for (const winner of winners.docs) {
      const userKey = relationKey(winner.user);
      const giveawayKey = relationKey(winner.giveaway);
      if (userKey && giveawayKey) {
        wonAt.set(`${giveawayKey}:${userKey}`, winner.tier as PrizeTier);
      }
    }

    const tookPart = new Set<string>();
    const everySeenUser = new Set<UserKey>();
    for (const ticket of tickets.docs) {
      const userKey = relationKey(ticket.user);
      const giveawayKey = relationKey(ticket.giveaway);
      if (userKey && giveawayKey && (ticket.quantity ?? 0) > 0) {
        tookPart.add(`${giveawayKey}:${userKey}`);
        everySeenUser.add(userKey);
      }
    }

    for (const userKey of everySeenUser) {
      const outcomes: DrawOutcome[] = priorGiveaways.docs.map((prior) => {
        const key = `${prior.id}:${userKey}`;
        const won = wonAt.get(key);
        if (won) {
          return won;
        }
        return tookPart.has(key) ? "participated_no_win" : null;
      });

      histories.set(userKey, { outcomes });
    }

    return histories;
  }

  /**
   * Accounts excluded from the draw entirely (spec §22.5, §22.6), and those
   * whose winnings must be held for review (§22.7, §22.8).
   */
  private async loadAccountFlags(): Promise<{
    excluded: Set<UserKey>;
    heldForReview: Set<UserKey>;
    reasons: Map<UserKey, string>;
  }> {
    const flags = await this.payload.find({
      collection: "giveaway-account-flags",
      pagination: false,
      depth: 0,
    });

    const excluded = new Set<UserKey>();
    const heldForReview = new Set<UserKey>();
    const reasons = new Map<UserKey, string>();

    for (const flag of flags.docs) {
      const userKey = relationKey(flag.user);
      if (!userKey) {
        continue;
      }

      // A duplicate-account group is excluded regardless of trust status: the
      // whole cluster comes out of the pool (§22.6).
      if (flag.trustStatus === "disqualified" || flag.duplicateAccountGroup) {
        excluded.add(userKey);
        reasons.set(
          userKey,
          flag.duplicateAccountGroup
            ? `Duplicate account group "${flag.duplicateAccountGroup}"`
            : (flag.reason ?? "Disqualified")
        );
        continue;
      }

      // Suspicion never removes anyone from the draw — the specification is
      // explicit that it must not alter the selection. It only holds the prize.
      if (flag.trustStatus === "suspicious") {
        heldForReview.add(userKey);
        reasons.set(userKey, flag.reason ?? "Flagged for review");
      }
    }

    return { excluded, heldForReview, reasons };
  }

  /** The three queries backing participation aggregation. */
  private fetchParticipationRows(giveawayId: string) {
    const forThisGiveaway = { giveaway: { equals: giveawayId } };

    return Promise.all([
      this.payload.find({
        collection: "giveaway-tickets",
        where: { and: [forThisGiveaway, { status: { equals: "valid" } }] },
        pagination: false,
        depth: 0,
      }),
      // Boosts and Featured Offers share a collection and are split by `type`,
      // so this is one query rather than two.
      this.payload.find({
        collection: "giveaway-engagements",
        where: {
          and: [forThisGiveaway, { completionStatus: { equals: "completed" } }],
        },
        pagination: false,
        depth: 0,
      }),
      // Streaks are not scoped to a giveaway — they persist across them.
      this.payload.find({
        collection: "giveaway-streaks",
        pagination: false,
        depth: 0,
      }),
    ]).then(([tickets, engagements, streaks]) => ({
      tickets,
      engagements,
      streaks,
    }));
  }

  private async loadPrizePool(giveawayId: string): Promise<PoolPrize[]> {
    const rows = await this.payload.find({
      collection: "giveaway-prizes",
      where: { giveaway: { equals: giveawayId } },
      pagination: false,
      depth: 1,
    });

    return rows.docs.map((row) => {
      const prize = row.prize;
      const prizeId = relationKey(prize);
      return {
        rowId: row.id,
        prizeId: prizeId ?? row.id,
        prizeName:
          typeof prize === "object" && prize !== null && "name" in prize
            ? String(prize.name)
            : String(prizeId),
        tier: row.tier as PrizeTier,
        maxUnits: row.maxUnits ?? 0,
        unitsAwarded: row.unitsAwarded ?? 0,
      };
    });
  }

  /**
   * Persist consecutive-giveaway streaks (spec §11). These survive the
   * post-draw reset of ticket, boost and offer aggregates — without that they
   * could never reach the required four.
   */
  private async updateStreaks(
    giveawayId: string,
    participation: Map<UserKey, Participation>
  ) {
    const existing = await this.payload.find({
      collection: "giveaway-streaks",
      pagination: false,
      depth: 0,
    });

    const byUserTier = indexStreakRows(existing.docs, giveawayId);
    const evaluated = new Set<string>();

    for (const [userKey, p] of participation) {
      for (const tier of TIER_PROCESSING_ORDER) {
        const value = nextStreakValue(tier, p);
        if (value === null) {
          continue;
        }

        const key = `${userKey}:${tier}`;
        evaluated.add(key);

        const row = byUserTier.get(key);
        if (row?.alreadyEvaluated) {
          continue;
        }

        await this.writeStreak(row?.id, {
          user: userKey,
          tier,
          consecutiveCount: value,
          lastEvaluatedGiveaway: giveawayId,
          lastQualifiedAt: value > 0 ? new Date().toISOString() : undefined,
        });
      }
    }

    await this.resetLapsedStreaks(giveawayId, byUserTier, evaluated);
  }

  /**
   * Zero the streak of anyone who did not participate at all.
   *
   * Sitting a giveaway out breaks the streak just like participating and
   * missing the bar — otherwise a run of qualifying giveaways with gaps in it
   * would still reach four, which is not what "consecutive" means. Rows already
   * at zero are skipped so this doesn't rewrite the whole table every draw.
   */
  private async resetLapsedStreaks(
    giveawayId: string,
    byUserTier: Map<string, StreakRow>,
    evaluated: Set<string>
  ) {
    for (const [key, row] of byUserTier) {
      const untouched =
        !evaluated.has(key) &&
        row.consecutiveCount > 0 &&
        !row.alreadyEvaluated;

      if (untouched) {
        await this.writeStreak(row.id, {
          user: row.userKey,
          tier: row.tier,
          consecutiveCount: 0,
          lastEvaluatedGiveaway: giveawayId,
        });
      }
    }
  }

  private async writeStreak(
    id: string | undefined,
    data: {
      user: UserKey;
      tier: PrizeTier;
      consecutiveCount: number;
      lastEvaluatedGiveaway: string;
      lastQualifiedAt?: string;
    }
  ) {
    if (id) {
      await this.payload.update({
        collection: "giveaway-streaks",
        id,
        data,
      });
      return;
    }

    await this.payload.create({ collection: "giveaway-streaks", data });
  }

  private tierPercentage(
    giveaway: TierPercentages,
    tier: PrizeTier
  ): number | null {
    const value =
      tier === "tier1"
        ? giveaway.tier1WinnerPercentage
        : tier === "tier2"
          ? giveaway.tier2WinnerPercentage
          : giveaway.tier3WinnerPercentage;
    return typeof value === "number" ? value : null;
  }

  private async audit(
    giveawayId: string,
    eventType: AuditEventType,
    message: string,
    detail?: Record<string, unknown>,
    tier?: string,
    user?: string
  ) {
    try {
      await this.payload.create({
        collection: "giveaway-audit-log",
        data: {
          giveaway: giveawayId,
          eventType,
          message,
          detail: detail ?? null,
          tier,
          user,
          occurredAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      // An audit write must never take down a draw that is otherwise sound.
      this.payload.logger.error(
        { err: error, eventType, giveawayId },
        "[giveaway] failed to write audit record"
      );
    }
  }
}

/**
 * Group valid tickets by user, producing both the per-user totals used for
 * eligibility and the flat list of weighted entries used for the draw.
 */
function aggregateTickets(
  docs: readonly { id: string; user?: unknown; quantity?: number | null }[]
) {
  const participation = new Map<UserKey, Participation>();
  const ticketEntries: TicketEntry[] = [];

  for (const ticket of docs) {
    const userKey = relationKey(ticket.user);
    const quantity = ticket.quantity ?? 0;
    if (!userKey || quantity < 1) {
      continue;
    }

    let entry = participation.get(userKey);
    if (!entry) {
      entry = {
        userId: userKey,
        validTickets: 0,
        boosts: 0,
        featuredOffers: 0,
        streaks: {},
      };
      participation.set(userKey, entry);
    }

    entry.validTickets += quantity;
    ticketEntries.push({ ticketId: ticket.id, userKey, quantity });
  }

  return { participation, ticketEntries };
}

/**
 * Tally completed engagements onto participants who hold a valid ticket,
 * splitting Boosts from Featured Offers by `type` (spec §7, §8).
 */
function countEngagements(
  participation: Map<UserKey, Participation>,
  docs: readonly { user?: unknown; type?: string | null }[]
) {
  for (const doc of docs) {
    const userKey = relationKey(doc.user);
    const entry = userKey ? participation.get(userKey) : undefined;
    if (!entry) {
      continue;
    }

    if (doc.type === "boost") {
      entry.boosts += 1;
    } else if (doc.type === "featured_offer") {
      entry.featuredOffers += 1;
    }
  }
}

/**
 * Whether the giveaway is in a state that permits a draw to run (spec §19).
 *
 * A completed draw is never repeatable. A failed one is repeatable only as an
 * explicit resume — re-running it fresh would re-process tiers that already
 * awarded prizes, handing a second prize to existing winners and breaking §13.
 */
function checkDrawableStatus(
  giveaway: { status: string; endDate: string },
  { ignoreEndDate, resume }: { ignoreEndDate: boolean; resume: boolean }
): string[] {
  const errors: string[] = [];

  if (LOCKED_GIVEAWAY_STATUSES.includes(giveaway.status as GiveawayStatus)) {
    errors.push(
      `Giveaway is already "${giveaway.status}" — a completed draw cannot be repeated without administrative authorization.`
    );
  }

  if (giveaway.status === "failed" && !resume) {
    errors.push(
      "This draw previously failed part-way through. It can only be continued as an authorized resume, not restarted."
    );
  }

  if (resume && giveaway.status !== "failed") {
    errors.push(
      `Only a failed draw can be resumed (giveaway is "${giveaway.status}").`
    );
  }

  if (!ignoreEndDate && new Date() < new Date(giveaway.endDate)) {
    errors.push(
      `The countdown has not ended yet (ends ${new Date(giveaway.endDate).toISOString()}).`
    );
  }

  return errors;
}

/** Key persisted streak rows by `user:tier` for lookup during the draw. */
function indexStreakRows(
  docs: readonly {
    id: string;
    user?: unknown;
    tier?: string | null;
    consecutiveCount?: number | null;
    lastEvaluatedGiveaway?: unknown;
  }[],
  giveawayId: string
): Map<string, StreakRow> {
  const byUserTier = new Map<string, StreakRow>();

  for (const row of docs) {
    const userKey = relationKey(row.user);
    if (!(userKey && row.tier)) {
      continue;
    }

    byUserTier.set(`${userKey}:${row.tier}`, {
      id: row.id,
      userKey,
      tier: row.tier as PrizeTier,
      consecutiveCount: row.consecutiveCount ?? 0,
      alreadyEvaluated: relationKey(row.lastEvaluatedGiveaway) === giveawayId,
    });
  }

  return byUserTier;
}

/** Attach each participant's prior consecutive-giveaway streak per tier. */
function applyStreaks(
  participation: Map<UserKey, Participation>,
  docs: readonly {
    user?: unknown;
    tier?: string | null;
    consecutiveCount?: number | null;
    lastEvaluatedGiveaway?: unknown;
  }[],
  giveawayId: string
) {
  for (const streak of docs) {
    const userKey = relationKey(streak.user);
    const entry = userKey ? participation.get(userKey) : undefined;
    // Ignored if this giveaway already advanced the streak (i.e. a re-run).
    const alreadyCounted =
      relationKey(streak.lastEvaluatedGiveaway) === giveawayId;

    if (entry && streak.tier && !alreadyCounted) {
      entry.streaks[streak.tier as PrizeTier] = streak.consecutiveCount ?? 0;
    }
  }
}

const EMPTY_HISTORY: UserDrawHistory = { outcomes: [] };

/**
 * Users who may compete for this tier (spec §12 step 1).
 *
 * Three gates, in order: they must not already hold a prize from this giveaway
 * (§13); they must clear the fairness cooldowns (§22.1–22.3); and they must
 * meet the tier's eligibility thresholds (§11) — relaxed by the loyalty waiver
 * where §22.4 grants one.
 *
 * Fairness is checked before eligibility so the exclusion reported is the
 * meaningful one: telling an administrator a user is serving a Tier 1 cooldown
 * is more use than telling them the user is short of a Featured Offer.
 */
function buildCandidatePool(
  tier: PrizeTier,
  participation: Map<UserKey, Participation>,
  winnersSoFar: Set<UserKey>,
  histories: Map<UserKey, UserDrawHistory>
): {
  candidates: Set<UserKey>;
  /** Count of users barred by each §22 rule, for the audit log. */
  fairnessExclusions: Map<string, number>;
  loyaltyWaivers: Set<UserKey>;
} {
  const candidates = new Set<UserKey>();
  const fairnessExclusions = new Map<string, number>();
  const loyaltyWaivers = new Set<UserKey>();

  for (const [userKey, p] of participation) {
    if (winnersSoFar.has(userKey)) {
      continue;
    }

    const verdict = evaluateFairness(
      tier,
      histories.get(userKey) ?? EMPTY_HISTORY
    );

    if (!verdict.eligible) {
      fairnessExclusions.set(
        verdict.rule,
        (fairnessExclusions.get(verdict.rule) ?? 0) + 1
      );
      continue;
    }

    if (verdict.loyaltyWaiver) {
      loyaltyWaivers.add(userKey);
    }

    if (evaluateEligibility(tier, p, verdict.loyaltyWaiver).eligible) {
      candidates.add(userKey);
    }
  }

  return { candidates, fairnessExclusions, loyaltyWaivers };
}

/** Normalise a Payload relationship value to a comparable key. */
function relationKey(value: unknown): UserKey | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "object" && "id" in value) {
    return String((value as { id: string | number }).id);
  }
  return String(value);
}
