import { randomUUID } from "node:crypto";
import type { BasePayload } from "payload";
import {
  type AuditEventType,
  checkpointIndex,
  type DrawAttemptOutcome,
  type DrawCheckpoint,
  FAIRNESS_LOOKBACK_DRAWS,
  type GiveawayStatus,
  IN_FLIGHT_GIVEAWAY_STATUSES,
  type PrizeTier,
  RESUMABLE_GIVEAWAY_STATUSES,
  TIER_CHECKPOINTS,
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
  /** Identifies this draw across every attempt at it (spec §19). */
  executionId: string;
  /** The last material checkpoint reached (spec §19). */
  lastCheckpoint: DrawCheckpoint | null;
  totalValidParticipants: number;
  totalWinners: number;
  tiers: TierOutcome[];
};

/**
 * Mutable state for one execution attempt (spec §19).
 *
 * `lastCheckpoint` is the engine's position in the thirteen-step sequence. It
 * is loaded from the giveaway on a resumption and advanced — never rewound — as
 * the draw proceeds, which is what makes each step idempotent: a step already
 * behind this marker is skipped rather than repeated.
 */
type RunContext = {
  giveawayId: string;
  seed: string;
  dryRun: boolean;
  resume: boolean;
  executionId: string;
  attemptId: string | null;
  lastCheckpoint: DrawCheckpoint | null;
  status: GiveawayStatus | null;
};

export type RunDrawOptions = {
  /** Compute the full draw without persisting anything. */
  dryRun?: boolean;
  /** Replay a previous draw by supplying its recorded seed. */
  seed?: string;
  /** Run even if the countdown has not ended. Intended for testing. */
  ignoreEndDate?: boolean;
  /**
   * Continue a draw that stopped part-way through (spec §19).
   *
   * Only permitted once an administrator has called `authorizeResumption`,
   * which is the authorization step the specification requires. A resumed draw
   * reuses the original execution id, seed and participant snapshot, continues
   * from the next incomplete checkpoint, skips tiers that already completed,
   * and treats existing winners as ineligible.
   *
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

    const ctx = await this.beginAttempt(giveaway, seed, dryRun, resume);

    try {
      // Checkpoint 1 — configuration validated (spec §19).
      await this.checkpoint(ctx, "config_validated", "ready");

      const result = await this.executeDraw(ctx);

      if (!dryRun) {
        await this.markCompleted(ctx, result);
      }

      result.lastCheckpoint = ctx.lastCheckpoint;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (!dryRun) {
        await this.stopAttempt(ctx, error, message);
      }

      throw error;
    }
  }

  /**
   * Open an execution attempt (spec §19).
   *
   * Every attempt at the same draw shares one execution id; each resumption is
   * a new attempt row linked to the one before it, so the history reads as
   * "this draw, attempt 3, authorized by X" rather than as three unrelated
   * runs. A resumption also inherits the position in the checkpoint sequence,
   * which is what lets it continue from the next incomplete step.
   */
  private async beginAttempt(
    giveaway: Giveaway,
    seed: string,
    dryRun: boolean,
    resume: boolean
  ): Promise<RunContext> {
    const giveawayId = giveaway.id;
    const executionId =
      (resume ? (giveaway.drawExecutionId as string | undefined) : undefined) ??
      randomUUID();

    const ctx: RunContext = {
      giveawayId,
      seed,
      dryRun,
      resume,
      executionId,
      attemptId: null,
      lastCheckpoint: resume
        ? ((giveaway.lastCheckpoint as DrawCheckpoint | null) ?? null)
        : null,
      status: (giveaway.status as GiveawayStatus) ?? null,
    };

    if (dryRun) {
      return ctx;
    }

    const previousAttempt = relationKey(giveaway.currentAttempt);
    const priorAttempts = await this.payload.find({
      collection: "giveaway-draw-attempts",
      where: { giveaway: { equals: giveawayId } },
      pagination: false,
      depth: 0,
    });

    const attempt = await this.payload.create({
      collection: "giveaway-draw-attempts",
      data: {
        giveaway: giveawayId,
        executionId,
        attemptNumber: priorAttempts.docs.length + 1,
        kind: resume ? "resumption" : "initial",
        resumes: resume ? previousAttempt : undefined,
        seed,
        outcome: "running",
        lastCheckpoint: ctx.lastCheckpoint ?? undefined,
        authorizedBy: resume
          ? ((giveaway.resumptionAuthorizedBy as string | undefined) ??
            undefined)
          : undefined,
        startedAt: new Date().toISOString(),
      },
    });

    ctx.attemptId = attempt.id;

    await this.payload.update({
      collection: "giveaways",
      id: giveawayId,
      data: {
        drawSeed: seed,
        drawExecutionId: executionId,
        currentAttempt: attempt.id,
        drawError: null,
        // A resumption keeps the original start time — it is the same draw.
        ...(resume ? {} : { drawStartedAt: new Date().toISOString() }),
      },
    });

    await this.audit(
      giveawayId,
      resume ? "draw_resumed" : "draw_started",
      resume
        ? `Draw resumed under authorization, continuing from "${ctx.lastCheckpoint ?? "the beginning"}"`
        : "Draw started",
      {
        seed,
        executionId,
        attemptId: attempt.id,
        resumingFrom: ctx.lastCheckpoint,
      }
    );

    return ctx;
  }

  /**
   * Record a completed material step (spec §19).
   *
   * Progress is monotonic: a checkpoint at or behind the current position is
   * ignored. That single rule is what makes every step idempotent — repeating
   * a request for a step that already completed writes nothing, duplicates no
   * winners, deducts no stock and emits no second audit event.
   */
  private async checkpoint(
    ctx: RunContext,
    checkpoint: DrawCheckpoint,
    status?: GiveawayStatus,
    detail?: Record<string, unknown>
  ) {
    if (ctx.dryRun) {
      return;
    }

    if (checkpointIndex(checkpoint) <= checkpointIndex(ctx.lastCheckpoint)) {
      return;
    }

    ctx.lastCheckpoint = checkpoint;
    if (status) {
      ctx.status = status;
    }

    await this.payload.update({
      collection: "giveaways",
      id: ctx.giveawayId,
      data: { lastCheckpoint: checkpoint, ...(status ? { status } : {}) },
    });

    if (ctx.attemptId) {
      await this.payload.update({
        collection: "giveaway-draw-attempts",
        id: ctx.attemptId,
        data: { lastCheckpoint: checkpoint },
      });
    }

    await this.audit(
      ctx.giveawayId,
      "checkpoint_reached",
      `Checkpoint ${checkpointIndex(checkpoint) + 1} of 13: ${checkpoint}`,
      { checkpoint, executionId: ctx.executionId, ...detail }
    );
  }

  /**
   * Move the giveaway to a new state without advancing the checkpoint.
   *
   * Status says what the engine is doing right now; the checkpoint says what it
   * has finished. They advance at different moments — POOL_BUILDING is entered
   * before there is anything to record — so they are set separately.
   */
  private async setStatus(ctx: RunContext, status: GiveawayStatus) {
    if (ctx.dryRun || ctx.status === status) {
      return;
    }

    ctx.status = status;
    await this.payload.update({
      collection: "giveaways",
      id: ctx.giveawayId,
      data: { status },
    });
  }

  private async markCompleted(ctx: RunContext, result: DrawResult) {
    await this.payload.update({
      collection: "giveaways",
      id: ctx.giveawayId,
      data: {
        status: "completed",
        drawCompletedAt: new Date().toISOString(),
      },
    });
    ctx.status = "completed";

    await this.audit(ctx.giveawayId, "draw_completed", "Draw completed", {
      totalWinners: result.totalWinners,
      totalValidParticipants: result.totalValidParticipants,
      executionId: ctx.executionId,
    });

    // Checkpoint 12 — the audit trail for this draw is complete. Checkpoint 13,
    // winner report generation, is reached by the §21 reporting job, which is
    // deliberately outside the draw: a mail failure must not interrupt a draw
    // that has already awarded its prizes correctly.
    await this.checkpoint(ctx, "audit_completed");

    await this.closeAttempt(ctx, "completed");
  }

  /**
   * Stop an attempt that threw (spec §19, Interruption Behaviour).
   *
   * The distinction the specification draws is between an interruption, which
   * preserves everything and waits for an administrator, and a failure, which
   * is where "recovery cannot safely continue".
   *
   * Almost everything is an interruption. A database going away mid-draw
   * leaves the winners, the locked pool and the remaining stock exactly as
   * they were, so the draw can be picked up from its last checkpoint. What
   * cannot be picked up is a draw that has already violated its own
   * invariants — two prizes to one user, or a prize past its unit ceiling.
   * Resuming that would build on a result that is already wrong, so it is
   * FAILED and needs a human before anything else happens. The same applies
   * when nothing completed at all: there is no checkpoint to continue from.
   *
   * Nothing is rolled back either way. Winner records and audit records are
   * immutable under §17, and §19 requires prize assignments, the locked pool
   * and remaining stock to survive an interruption intact.
   */
  private async stopAttempt(ctx: RunContext, error: unknown, message: string) {
    const unrecoverable =
      ctx.lastCheckpoint === null ||
      (error instanceof GiveawayEngineError &&
        error.code === "DRAW_INTEGRITY_FAILED");
    const interrupted = !unrecoverable;
    const status: GiveawayStatus = interrupted ? "interrupted" : "failed";

    await this.payload.update({
      collection: "giveaways",
      id: ctx.giveawayId,
      data: { status, drawError: message },
    });
    ctx.status = status;

    await this.audit(
      ctx.giveawayId,
      interrupted ? "draw_interrupted" : "draw_error",
      interrupted
        ? `Draw interrupted after "${ctx.lastCheckpoint}". Records preserved; an administrator must authorize resumption.`
        : "Draw failed and cannot safely be resumed without review",
      {
        message,
        executionId: ctx.executionId,
        lastCheckpoint: ctx.lastCheckpoint,
      }
    );

    await this.closeAttempt(
      ctx,
      interrupted ? "interrupted" : "failed",
      message
    );

    // §19 requires an authorized administrator to be notified. Until the §21
    // mail work lands this is a log line, which is at least visible in the
    // server's alerting rather than silent.
    this.payload.logger.error(
      {
        giveawayId: ctx.giveawayId,
        executionId: ctx.executionId,
        lastCheckpoint: ctx.lastCheckpoint,
        status,
      },
      `[giveaway] draw ${status} — administrator authorization required to continue`
    );
  }

  private async closeAttempt(
    ctx: RunContext,
    outcome: DrawAttemptOutcome,
    error?: string
  ) {
    if (!ctx.attemptId) {
      return;
    }

    await this.payload.update({
      collection: "giveaway-draw-attempts",
      id: ctx.attemptId,
      data: {
        outcome,
        error,
        lastCheckpoint: ctx.lastCheckpoint ?? undefined,
        endedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Authorize the resumption of an interrupted or failed draw (spec §19).
   *
   * This is the gate the specification asks for: an interrupted draw cannot be
   * restarted by anyone until an administrator has reviewed it, so `runDraw`
   * refuses to resume anything that is not in RESUMPTION_AUTHORIZED. Callers
   * must enforce the administrator role themselves — the engine records who
   * authorized it but has no way to verify the claim.
   */
  async authorizeResumption(
    giveawayId: string,
    { authorizedBy, note }: { authorizedBy: string; note?: string }
  ): Promise<{ authorized: boolean; message?: string }> {
    const giveaway = await this.payload.findByID({
      collection: "giveaways",
      id: giveawayId,
      depth: 0,
    });

    if (!giveaway) {
      return { authorized: false, message: "Giveaway not found." };
    }

    const status = giveaway.status as GiveawayStatus;

    if (status === "resumption_authorized") {
      return {
        authorized: true,
        message: "This draw was already authorized to resume.",
      };
    }

    if (!RESUMABLE_GIVEAWAY_STATUSES.includes(status)) {
      return {
        authorized: false,
        message: `Only an interrupted or failed draw can be authorized to resume (giveaway is "${status}").`,
      };
    }

    await this.payload.update({
      collection: "giveaways",
      id: giveawayId,
      data: {
        status: "resumption_authorized",
        resumptionAuthorizedBy: authorizedBy,
        resumptionAuthorizedAt: new Date().toISOString(),
      },
    });

    await this.audit(
      giveawayId,
      "resumption_authorized",
      `Resumption authorized by ${authorizedBy}`,
      {
        authorizedBy,
        note,
        fromStatus: status,
        lastCheckpoint: giveaway.lastCheckpoint,
      }
    );

    return { authorized: true };
  }

  /**
   * Cancel a giveaway (spec §19, CANCELLED).
   *
   * Refused once a draw is in flight or complete: prizes have been allocated by
   * then, and cancelling would leave winners holding records for a giveaway
   * that claims never to have happened. An interrupted draw must be resolved
   * one way or the other first.
   */
  async cancelGiveaway(
    giveawayId: string,
    { reason, cancelledBy }: { reason: string; cancelledBy?: string }
  ): Promise<{ cancelled: boolean; message?: string }> {
    const giveaway = await this.payload.findByID({
      collection: "giveaways",
      id: giveawayId,
      depth: 0,
    });

    if (!giveaway) {
      return { cancelled: false, message: "Giveaway not found." };
    }

    const status = giveaway.status as GiveawayStatus;

    if (status === "cancelled") {
      return { cancelled: true, message: "Already cancelled." };
    }

    if (status === "completed") {
      return {
        cancelled: false,
        message: "A completed draw cannot be cancelled — prizes are allocated.",
      };
    }

    if (
      IN_FLIGHT_GIVEAWAY_STATUSES.includes(status) ||
      status === "interrupted" ||
      status === "resumption_authorized"
    ) {
      return {
        cancelled: false,
        message: `A draw is part-way through ("${status}"). Resolve it before cancelling.`,
      };
    }

    await this.payload.update({
      collection: "giveaways",
      id: giveawayId,
      data: { status: "cancelled", drawError: reason },
    });

    await this.audit(
      giveawayId,
      "giveaway_cancelled",
      `Giveaway cancelled: ${reason}`,
      { reason, cancelledBy, fromStatus: status }
    );

    return { cancelled: true };
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

  private async executeDraw(ctx: RunContext): Promise<DrawResult> {
    const { giveawayId, seed, dryRun, resume } = ctx;

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

    const tiers = await this.runTiers({
      ctx,
      giveaway,
      totalValidParticipants,
      participation,
      ticketEntries,
      prizePool,
      winnersSoFar,
      histories,
      heldForReview: accountFlags.heldForReview,
      winnersByTier,
      completedTiers,
    });

    if (!dryRun) {
      await this.updateStreaks(giveawayId, participation);
    }

    // Checkpoint 10 — final validation against the §18 integrity checklist.
    await this.verifyDrawIntegrity(ctx, tiers);
    await this.checkpoint(ctx, "final_validation");

    // Checkpoint 11 — the result is confirmed and will not change.
    await this.checkpoint(ctx, "result_confirmed");

    return {
      giveawayId,
      seed,
      dryRun,
      executionId: ctx.executionId,
      lastCheckpoint: ctx.lastCheckpoint,
      totalValidParticipants,
      totalWinners: tiers.reduce((sum, t) => sum + t.winners.length, 0),
      tiers,
    };
  }

  /**
   * Process every tier in order (spec §12).
   *
   * A tier that already completed on an earlier attempt is replayed from its
   * persisted records rather than re-drawn — that is what stops a resumption
   * awarding a second time — while a tier that was interrupted part-way is
   * drawn again with its existing winners counted against its cap.
   */
  private async runTiers(args: {
    ctx: RunContext;
    giveaway: Giveaway;
    totalValidParticipants: number;
    participation: Map<UserKey, Participation>;
    ticketEntries: TicketEntry[];
    prizePool: PoolPrize[];
    winnersSoFar: Set<UserKey>;
    histories: Map<UserKey, UserDrawHistory>;
    heldForReview: Set<UserKey>;
    winnersByTier: Map<PrizeTier, TierOutcome["winners"]>;
    completedTiers: Set<PrizeTier>;
  }): Promise<TierOutcome[]> {
    const { ctx, giveaway, winnersByTier, completedTiers } = args;
    const tiers: TierOutcome[] = [];

    for (const tier of TIER_PROCESSING_ORDER) {
      const winnerPercentage = this.tierPercentage(giveaway, tier) ?? 0;

      if (completedTiers.has(tier)) {
        const winners = winnersByTier.get(tier) ?? [];
        tiers.push({
          tier,
          winnerPercentage,
          candidatePoolSize: 0,
          maxWinnersByPercentage: maxTierWinners(
            args.totalValidParticipants,
            winnerPercentage
          ),
          unitsAvailable: 0,
          effectiveCap: winners.length,
          skipped: true,
          winners,
        });
        await this.checkpoint(ctx, TIER_CHECKPOINTS[tier].selected);
        await this.checkpoint(ctx, TIER_CHECKPOINTS[tier].allocated);
        continue;
      }

      tiers.push(
        await this.processTier({
          ctx,
          tier,
          winnerPercentage,
          totalValidParticipants: args.totalValidParticipants,
          participation: args.participation,
          ticketEntries: args.ticketEntries,
          prizePool: args.prizePool,
          winnersSoFar: args.winnersSoFar,
          histories: args.histories,
          heldForReview: args.heldForReview,
          // A tier interrupted part-way through has winners on record but no
          // completion marker. They count against this tier's cap, or a
          // resumed draw would award the full percentage a second time (§9).
          priorWinners: winnersByTier.get(tier) ?? [],
        })
      );
    }

    return tiers;
  }

  /**
   * The §18 draw-integrity checklist, run before the result is confirmed
   * (spec §19, checkpoint 10).
   *
   * These are the invariants the rest of the engine is built to maintain, so
   * in normal operation this finds nothing. It exists for the case where a
   * resumption, a replacement or a concurrent write has broken one of them:
   * better to interrupt and hold the result for review than to confirm a draw
   * that has awarded two prizes to one person or overspent a prize's stock.
   */
  private async verifyDrawIntegrity(ctx: RunContext, tiers: TierOutcome[]) {
    const problems: string[] = [];

    const seen = new Set<UserKey>();
    for (const tier of tiers) {
      for (const winner of tier.winners) {
        if (seen.has(winner.userKey)) {
          problems.push(
            `User ${winner.userKey} holds more than one prize in this giveaway (§13).`
          );
        }
        seen.add(winner.userKey);
      }
    }

    if (ctx.dryRun) {
      // Nothing was persisted, so only the in-memory result can be checked.
      if (problems.length > 0) {
        throw new GiveawayEngineError(
          `Draw integrity check failed: ${problems.join("; ")}`,
          "DRAW_INTEGRITY_FAILED",
          problems
        );
      }
      return;
    }

    const prizeRows = await this.payload.find({
      collection: "giveaway-prizes",
      where: { giveaway: { equals: ctx.giveawayId } },
      pagination: false,
      depth: 0,
    });

    for (const row of prizeRows.docs) {
      if ((row.unitsAwarded ?? 0) > (row.maxUnits ?? 0)) {
        problems.push(
          `Prize row ${row.id} awarded ${row.unitsAwarded} of a maximum ${row.maxUnits} units (§5).`
        );
      }
    }

    if (problems.length > 0) {
      throw new GiveawayEngineError(
        `Draw integrity check failed: ${problems.join("; ")}`,
        "DRAW_INTEGRITY_FAILED",
        problems
      );
    }
  }

  private async processTier(args: {
    ctx: RunContext;
    tier: PrizeTier;
    winnerPercentage: number;
    totalValidParticipants: number;
    participation: Map<UserKey, Participation>;
    ticketEntries: TicketEntry[];
    prizePool: PoolPrize[];
    winnersSoFar: Set<UserKey>;
    histories: Map<UserKey, UserDrawHistory>;
    heldForReview: Set<UserKey>;
    priorWinners: TierOutcome["winners"];
  }): Promise<TierOutcome> {
    const {
      ctx,
      tier,
      winnerPercentage,
      totalValidParticipants,
      participation,
      ticketEntries,
      prizePool,
      winnersSoFar,
      histories,
      heldForReview,
      priorWinners,
    } = args;
    const { giveawayId, seed, dryRun } = ctx;

    // Step 1 — Build the candidate pool (spec §12), applying the fairness
    // rules of §22 alongside the tier eligibility thresholds of §11.
    await this.setStatus(ctx, "pool_building");

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
    // available prize units, or the candidate pool size (spec §9). Winners a
    // previous, interrupted attempt already awarded in this tier have spent
    // part of the percentage allowance, so only the remainder is available.
    const remainingAllowance = Math.max(
      0,
      maxByPercentage - priorWinners.length
    );
    const effectiveCap = Math.min(
      remainingAllowance,
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
      winners: [...priorWinners],
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

    // Only entries belonging to candidates form the locked pool (§12).
    const pooledEntries = ticketEntries.filter((entry) =>
      candidates.has(entry.userKey)
    );

    /**
     * Lock the pool before selecting anything (§12).
     *
     * The specification requires the pool to be locked, not merely computed:
     * a replacement winner must later be drawn from "the original locked
     * candidate pool". That is impossible if the pool only ever existed in
     * memory, because a refund typically surfaces long after the draw.
     *
     * Written even when the tier awards nobody, so the record of who *could*
     * have won is complete.
     */
    // Checkpoint 2 — the candidate pool exists (spec §19).
    await this.checkpoint(ctx, "pool_generated", undefined, { tier });

    if (!dryRun) {
      await this.lockCandidatePool(giveawayId, tier, candidates, pooledEntries);
    }

    // Checkpoint 3 — and it is locked. Later tiers lock their own pools, which
    // the audit log records; the checkpoint marker only moves forwards.
    await this.checkpoint(ctx, "pool_locked", "pool_locked", { tier });

    if (effectiveCap === 0) {
      await this.completeTier(ctx, tier, outcome);
      return outcome;
    }

    await this.setStatus(ctx, "draw_in_progress");

    const selectionRng = createRng(seed, `winners:${tier}`);
    const allocationRng = createRng(seed, `prizes:${tier}`);

    // The locked pool is exactly the set the draw may pick from.
    const eligibleEntries = pooledEntries;

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

    await this.completeTier(ctx, tier, outcome);

    return outcome;
  }

  /**
   * Close out a tier: record its completion and its two §19 checkpoints.
   *
   * This runs for every tier, including one that awards nobody. A tier that
   * finished with an empty pool or a disabled percentage is finished all the
   * same, and without the marker a resumed draw would rebuild and re-lock it
   * for no reason.
   *
   * Winner selection and prize allocation are separate checkpoints in the
   * specification but interleaved in this engine — each winner is allocated a
   * prize the moment they are drawn, which is what keeps unit accounting exact
   * when stock runs out mid-tier — so both are reached here, in order.
   */
  private async completeTier(
    ctx: RunContext,
    tier: PrizeTier,
    outcome: TierOutcome
  ) {
    if (!ctx.dryRun) {
      await this.audit(
        ctx.giveawayId,
        "tier_completed",
        `${tier} complete: ${outcome.winners.length} winners`,
        { tier, winners: outcome.winners.length },
        tier
      );
    }

    await this.checkpoint(ctx, TIER_CHECKPOINTS[tier].selected, undefined, {
      tier,
      winners: outcome.winners.length,
    });
    await this.checkpoint(ctx, TIER_CHECKPOINTS[tier].allocated, undefined, {
      tier,
    });
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

  /** Persist the locked candidate pool for one tier (spec §12). */
  private async lockCandidatePool(
    giveawayId: string,
    tier: PrizeTier,
    candidates: Set<UserKey>,
    entries: TicketEntry[]
  ) {
    // A resumed draw re-reaches tiers it already locked. The pool must not be
    // rewritten — it is the record of what the original draw saw.
    const existing = await this.payload.find({
      collection: "giveaway-pool-snapshots",
      where: {
        and: [{ giveaway: { equals: giveawayId } }, { tier: { equals: tier } }],
      },
      limit: 1,
      pagination: false,
      depth: 0,
    });

    if (existing.docs.length > 0) {
      return;
    }

    await this.payload.create({
      collection: "giveaway-pool-snapshots",
      data: {
        giveaway: giveawayId,
        tier,
        candidateCount: candidates.size,
        entries,
        lockedAt: new Date().toISOString(),
      },
    });

    await this.audit(
      giveawayId,
      "candidate_pool_locked",
      `${tier} candidate pool locked: ${candidates.size} users, ${entries.length} ticket entries`,
      { tier, candidateCount: candidates.size, entryCount: entries.length },
      tier
    );
  }

  /**
   * Disqualify a winner and draw their replacement from the locked pool
   * (spec §12).
   *
   * The specification is emphatic that this must not rerun the draw: every
   * other winner keeps their prize, and the replacement comes from the pool as
   * it was locked, not from a pool rebuilt out of data that has since changed.
   *
   * The disqualified record is kept rather than deleted, so the audit trail
   * shows what happened. The replacement inherits the same prize — no stock is
   * returned or re-allocated, because the unit was already spent.
   *
   * Selection is seeded from the draw seed plus the disqualified winner's id,
   * which makes each replacement reproducible and distinct: replacing the same
   * winner twice would pick the same person, while replacing two different
   * winners cannot collide.
   */
  async replaceWinner(
    winnerId: string,
    { reason }: { reason: string }
  ): Promise<
    | { replaced: true; replacementWinnerId: string; userKey: UserKey }
    | { replaced: false; message: string }
  > {
    const winner = await this.payload.findByID({
      collection: "giveaway-winners",
      id: winnerId,
      depth: 0,
    });

    if (!winner) {
      return { replaced: false, message: "Winner record not found." };
    }

    if (winner.claimStatus === "disqualified") {
      return {
        replaced: false,
        message: "This winner has already been disqualified.",
      };
    }

    if (winner.fulfilmentStatus === "fulfilled") {
      return {
        replaced: false,
        message:
          "This prize has already been fulfilled and cannot be withdrawn here.",
      };
    }

    const giveawayId = relationKey(winner.giveaway);
    const tier = winner.tier as PrizeTier;
    if (!giveawayId) {
      return { replaced: false, message: "Winner has no giveaway." };
    }

    const giveaway = await this.payload.findByID({
      collection: "giveaways",
      id: giveawayId,
      depth: 0,
    });

    // Record the disqualification before drawing anyone, so a failure midway
    // leaves the prize withheld rather than awarded twice.
    await this.payload.update({
      collection: "giveaway-winners",
      id: winnerId,
      data: {
        claimStatus: "disqualified",
        fulfilmentStatus: "cancelled",
        disqualifiedAt: new Date().toISOString(),
        disqualificationReason: reason,
      },
    });

    await this.audit(
      giveawayId,
      "winner_disqualified",
      `Winner disqualified: ${reason}`,
      { tier, winnerId, reason },
      tier,
      relationKey(winner.user) ?? undefined
    );

    const snapshot = await this.payload.find({
      collection: "giveaway-pool-snapshots",
      where: {
        and: [{ giveaway: { equals: giveawayId } }, { tier: { equals: tier } }],
      },
      limit: 1,
      pagination: false,
      depth: 0,
    });

    const pool = snapshot.docs[0];
    if (!pool) {
      return {
        replaced: false,
        message: `Disqualified, but no locked candidate pool exists for ${tier}, so no replacement can be drawn.`,
      };
    }

    const excluded = await this.usersIneligibleForReplacement(giveawayId);
    const entries = (pool.entries as TicketEntry[]).filter(
      (entry) => !excluded.has(entry.userKey)
    );

    // Tickets invalidated since the lock cannot win (§12).
    const validEntries = await this.dropInvalidatedTickets(entries);

    const seed = (giveaway?.drawSeed as string | undefined) ?? winnerId;
    const replacement = weightedPick(
      validEntries,
      (entry) => entry.quantity,
      createRng(seed, `replacement:${winnerId}`)
    );

    if (!replacement) {
      return {
        replaced: false,
        message: `Disqualified, but no eligible replacement remains in the ${tier} pool.`,
      };
    }

    const prizeId = relationKey(winner.prize);
    if (!prizeId) {
      return {
        replaced: false,
        message: "Disqualified, but the original prize could not be resolved.",
      };
    }

    const created = await this.payload.create({
      collection: "giveaway-winners",
      data: {
        giveaway: giveawayId,
        user: replacement.userKey,
        tier,
        prize: prizeId,
        prizeName: winner.prizeName,
        winningTicket: replacement.ticketId,
        validTicketCount: replacement.quantity,
        boostCount: 0,
        featuredOfferCount: 0,
        selectedAt: new Date().toISOString(),
        claimStatus: "unclaimed",
        fulfilmentStatus: "pending",
        replaces: winnerId,
      },
    });

    await this.audit(
      giveawayId,
      "replacement_selected",
      `Replacement drawn from the locked ${tier} pool for a disqualified winner`,
      { tier, replaces: winnerId, ticketId: replacement.ticketId },
      tier,
      replacement.userKey
    );

    return {
      replaced: true,
      replacementWinnerId: created.id,
      userKey: replacement.userKey,
    };
  }

  /**
   * Everyone who cannot be drawn as a replacement: current winners of this
   * giveaway, anyone already disqualified from it, and flagged accounts.
   */
  private async usersIneligibleForReplacement(
    giveawayId: string
  ): Promise<Set<UserKey>> {
    const [winners, flags] = await Promise.all([
      this.payload.find({
        collection: "giveaway-winners",
        where: { giveaway: { equals: giveawayId } },
        pagination: false,
        depth: 0,
      }),
      this.loadAccountFlags(),
    ]);

    // Every winner row counts, including disqualified ones — §12 excludes
    // "previously selected replacement candidates" as well as current winners,
    // so nobody who has already been drawn can be drawn again.
    const excluded = new Set<UserKey>(flags.excluded);
    for (const row of winners.docs) {
      const userKey = relationKey(row.user);
      if (userKey) {
        excluded.add(userKey);
      }
    }

    return excluded;
  }

  /** Remove entries whose ticket is no longer valid (§12 post-draw events). */
  private async dropInvalidatedTickets(
    entries: TicketEntry[]
  ): Promise<TicketEntry[]> {
    if (entries.length === 0) {
      return entries;
    }

    const stillValid = await this.payload.find({
      collection: "giveaway-tickets",
      where: {
        and: [
          { id: { in: entries.map((entry) => entry.ticketId) } },
          { status: { equals: "valid" } },
        ],
      },
      pagination: false,
      depth: 0,
    });

    const validIds = new Set(stillValid.docs.map((doc) => String(doc.id)));
    return entries.filter((entry) => validIds.has(entry.ticketId));
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
 * A completed or cancelled draw is never repeatable. An interrupted or failed
 * one can only be continued as an authorized resumption — re-running it fresh
 * would re-process tiers that already awarded prizes, handing a second prize
 * to existing winners and breaking §13. That authorization is a separate,
 * recorded act (`authorizeResumption`), which is how §19's "prevent ordinary
 * users from restarting draw" is enforced: wanting to resume is not enough,
 * the giveaway has to have been moved to RESUMPTION_AUTHORIZED first.
 */
function checkDrawableStatus(
  giveaway: { status: string; endDate: string },
  { ignoreEndDate, resume }: { ignoreEndDate: boolean; resume: boolean }
): string[] {
  const errors: string[] = [];
  const status = giveaway.status as GiveawayStatus;

  if (status === "completed") {
    errors.push(
      "This draw has already completed. A completed draw cannot be repeated."
    );
  }

  if (status === "cancelled") {
    errors.push("This giveaway was cancelled and cannot be drawn.");
  }

  if (IN_FLIGHT_GIVEAWAY_STATUSES.includes(status)) {
    errors.push(
      `A draw is already in progress ("${status}"). Wait for it to finish or be interrupted.`
    );
  }

  if (RESUMABLE_GIVEAWAY_STATUSES.includes(status)) {
    errors.push(
      `This draw stopped part-way through ("${status}"). An administrator must authorize its resumption before it can continue; it cannot be restarted.`
    );
  }

  if (resume && status !== "resumption_authorized") {
    errors.push(
      `Only a draw whose resumption has been authorized can be resumed (giveaway is "${status}").`
    );
  }

  if (!resume && status === "resumption_authorized") {
    errors.push(
      "This draw is authorized to resume, not to restart. Run it as a resumption so the tiers that already completed are not drawn again."
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
