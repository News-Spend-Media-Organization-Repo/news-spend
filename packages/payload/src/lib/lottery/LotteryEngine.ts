import type { LotteryTicket } from "../../payload-types";

type PrizeConfig = {
  name: string;
  probability: number;
};

type PrizeTiers = {
  HIGH: PrizeConfig[];
  MID: PrizeConfig[];
  LOW: PrizeConfig[];
};

type TierResult = {
  tier: "HIGH" | "MID" | "LOW" | null;
  guaranteed: boolean;
};

// Prize configuration matching requirements
const PRIZES: PrizeTiers = {
  HIGH: [
    { name: "Fridge", probability: 1 },
    { name: "Freezer", probability: 1 },
    { name: "Generator", probability: 1 },
    { name: "Laptop", probability: 1 },
    { name: "Smart TV", probability: 1 },
  ],
  MID: [
    { name: "Phone", probability: 1 },
    { name: "iPad", probability: 1 },
    { name: "Smart Home Assistant", probability: 1 },
    { name: "Smart Speakers", probability: 1 },
    { name: "Headphones", probability: 1 },
    { name: "Apple Watch", probability: 1 },
    { name: "Blender", probability: 1 },
  ],
  LOW: [
    { name: "50", probability: 0.25 },
    { name: "100", probability: 0.2 },
    { name: "150", probability: 0.15 },
    { name: "200", probability: 0.1 },
    { name: "250", probability: 0.1 },
    { name: "400", probability: 0.08 },
    { name: "500", probability: 0.06 },
    { name: "1000", probability: 0.03 },
    { name: "2000", probability: 0.02 },
    { name: "3000", probability: 0.005 },
    { name: "4000", probability: 0.005 },
  ],
} as const;

export class LotteryEngineError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "LotteryEngineError";
  }
}

export class LotteryEngine {
  private readonly payload: import("payload").BasePayload;
  private static readonly CONSECUTIVE_ROUNDS_THRESHOLD = 4;
  private static readonly HIGH_TIER_PROBABILITY = 0.0001; // 1 in 10,000
  private static readonly MID_TIER_PROBABILITY = 0.0002; // 1 in 5,000

  constructor(payload: import("payload").BasePayload) {
    this.payload = payload;
  }

  /**
   * Main lottery execution function
   */
  async runLottery(lotteryId?: number) {
    try {
      // Get active lottery
      const currentRound = await this.payload.find({
        collection: "lottery",
        where: lotteryId
          ? { id: { equals: lotteryId } }
          : { isActive: { equals: true } },
        limit: 1,
        pagination: false,
      });

      if (!currentRound.docs[0]) {
        throw new LotteryEngineError(
          "No active lottery found",
          "NO_ACTIVE_LOTTERY"
        );
      }

      const activeLottery = currentRound.docs[0];

      // Get all participants
      const tickets = await this.payload.find({
        collection: "lottery-tickets",
        where: { lottery: { equals: activeLottery.id } },
        pagination: false,
      });

      if (tickets.docs.length === 0) {
        console.log("[LOTTERY] No participants found");
        return {
          success: true,
          message: "No participants",
          winners: [],
        };
      }

      console.log(`[LOTTERY] Processing ${tickets.docs.length} participants`);
      const winners = [];

      // Process each participant
      for (const ticket of tickets.docs) {
        try {
          const userId =
            typeof ticket.user === "string" ? ticket.user : ticket.user.id;

          // Determine tier and prize
          const tierResult = await this.determineTier(ticket);
          const prize = this.selectPrize(tierResult.tier, ticket);

          // Create winner record
          const winner = await this.payload.create({
            collection: "lottery-winners",
            data: {
              user: userId,
              // @ts-expect-error - prizeTier enum
              prizeTier: prize.tier,
              lottery: activeLottery.id,
              prize: prize.name,
              claimed: false,
            },
          });

          winners.push(winner);
          console.log(
            `[LOTTERY] Winner: ${userId} - ${prize.tier} - ${prize.name}`
          );
        } catch (error) {
          console.error(
            `[LOTTERY] Error processing ticket ${ticket.id}:`,
            error
          );
          // Continue with next ticket
        }
      }

      // Deactivate lottery
      await this.payload.update({
        collection: "lottery",
        id: activeLottery.id,
        data: { isActive: false },
      });

      console.log(`[LOTTERY] Completed. ${winners.length} winners created`);

      return {
        success: true,
        message: "Lottery draw completed",
        totalParticipants: tickets.docs.length,
        totalWinners: winners.length,
        winners,
      };
    } catch (error) {
      console.error("[LOTTERY] Fatal error:", error);
      throw error;
    }
  }

  /**
   * Determine prize tier for a ticket based on all eligibility rules
   */
  private async determineTier(ticket: LotteryTicket): Promise<TierResult> {
    const userId =
      typeof ticket.user === "string" ? ticket.user : ticket.user.id;
    const ticketCount = ticket.count;
    const boostCount = ticket.boostLuck;

    // Check consecutive participation bonus
    const hasConsecutiveBonus =
      await this.checkConsecutiveParticipation(userId);

    // HIGH TIER ELIGIBILITY
    // Primary: 10+ tickets AND 3 boosts
    // Exception: 4 consecutive rounds with 3+ tickets and 3 boosts each
    if (
      ((ticketCount >= 10 && boostCount === 3) || hasConsecutiveBonus) &&
      Math.random() < LotteryEngine.HIGH_TIER_PROBABILITY
    ) {
      return { tier: "HIGH", guaranteed: false };
    }

    // MID TIER ELIGIBILITY
    // Primary: 3-9 tickets AND 3 boosts
    // Exception: 4 consecutive rounds with 3+ tickets and 3 boosts each
    if (
      ((ticketCount >= 3 && ticketCount <= 9 && boostCount === 3) ||
        hasConsecutiveBonus) &&
      Math.random() < LotteryEngine.MID_TIER_PROBABILITY
    ) {
      return { tier: "MID", guaranteed: false };
    }

    // STANDARD WEIGHTED RANDOM (for users not meeting special criteria)
    const random = Math.random() * 100;

    if (random <= 5) {
      // 5% chance HIGH tier
      return { tier: "HIGH", guaranteed: false };
    }
    if (random <= 30) {
      // 25% chance MID tier (6-30)
      return { tier: "MID", guaranteed: false };
    }

    // LOW TIER (70% or guaranteed)
    // Guarantee: 10+ tickets OR any boosts used
    const hasGuarantee = ticketCount >= 10 || boostCount > 0;

    return {
      tier: "LOW",
      guaranteed: hasGuarantee,
    };
  }

  /**
   * Select specific prize from tier
   */
  private selectPrize(
    tier: "HIGH" | "MID" | "LOW" | null,
    _ticket: LotteryTicket
  ) {
    // Default to LOW tier if null
    if (!tier) {
      tier = "LOW";
    }

    if (tier === "HIGH") {
      const prize =
        PRIZES.HIGH[Math.floor(Math.random() * PRIZES.HIGH.length)]!;
      return { name: prize.name, tier: "HIGH" };
    }

    if (tier === "MID") {
      const prize = PRIZES.MID[Math.floor(Math.random() * PRIZES.MID.length)];
      return { name: prize?.name, tier: "MID" };
    }

    // LOW TIER - Use weighted random selection
    return this.selectLowTierPrize();
  }

  /**
   * Select LOW tier prize using cumulative probability distribution
   */
  private selectLowTierPrize(): { name: string; tier: string } {
    const random = Math.random();
    let cumulative = 0;

    for (const prize of PRIZES.LOW) {
      cumulative += prize.probability;
      if (random <= cumulative) {
        return { name: prize.name, tier: "LOW" };
      }
    }

    // Fallback (should never reach here due to probabilities summing to 1)
    return { name: PRIZES?.LOW?.[0]?.name!, tier: "LOW" };
  }

  /**
   * Check if user has participated in 4 consecutive rounds with qualifying tickets
   * Requirement: 3+ tickets AND 3 boosts in each of last 4 rounds
   */
  private async checkConsecutiveParticipation(
    userId: string
  ): Promise<boolean> {
    try {
      // Get last 4 lotteries (excluding current one)
      const lastFourLotteries = await this.payload.find({
        collection: "lottery",
        sort: "-createdAt",
        limit: LotteryEngine.CONSECUTIVE_ROUNDS_THRESHOLD + 1, // +1 because current might be included
        pagination: false,
      });

      if (
        lastFourLotteries.docs.length <
        LotteryEngine.CONSECUTIVE_ROUNDS_THRESHOLD
      ) {
        return false;
      }

      let consecutiveCount = 0;

      // Check last 4 lotteries (skip first if it's the current active one)
      const lotteriesToCheck = lastFourLotteries.docs
        .filter((lottery) => !lottery.isActive)
        .slice(0, LotteryEngine.CONSECUTIVE_ROUNDS_THRESHOLD);

      for (const lottery of lotteriesToCheck) {
        const ticket = await this.payload.find({
          collection: "lottery-tickets",
          where: {
            and: [
              { user: { equals: userId } },
              { lottery: { equals: lottery.id } },
              { count: { greater_than_equal: 3 } },
              { boostLuck: { equals: 3 } }, // Must be exactly 3 boosts
            ],
          },
          limit: 1,
        });

        if (ticket.docs.length > 0) {
          consecutiveCount += 1;
        } else {
          // Streak broken
          break;
        }
      }

      return consecutiveCount >= LotteryEngine.CONSECUTIVE_ROUNDS_THRESHOLD;
    } catch (error) {
      console.error(
        "[LOTTERY] Error checking consecutive participation:",
        error
      );
      return false;
    }
  }

  /**
   * Get statistics for a lottery
   */
  async getLotteryStats(lotteryId: number) {
    const [tickets, winners] = await Promise.all([
      this.payload.find({
        collection: "lottery-tickets",
        where: { lottery: { equals: lotteryId } },
        pagination: false,
      }),
      this.payload.find({
        collection: "lottery-winners",
        where: { lottery: { equals: lotteryId } },
        pagination: false,
      }),
    ]);

    const tierCounts = {
      HIGH: 0,
      MID: 0,
      LOW: 0,
    };

    for (const winner of winners.docs) {
      const tier = winner.prizeTier as "HIGH" | "MID" | "LOW";
      if (tier in tierCounts) {
        tierCounts[tier] += 1;
      }
    }

    return {
      totalParticipants: tickets.docs.length,
      totalWinners: winners.docs.length,
      tierDistribution: tierCounts,
      averageTicketsPerUser:
        tickets.docs.reduce((sum, t) => sum + t.count, 0) / tickets.docs.length,
      averageBoostsPerUser:
        tickets.docs.reduce((sum, t) => sum + t.boostLuck, 0) /
        tickets.docs.length,
    };
  }

  /**
   * Validate lottery configuration before running
   */
  async validateLottery(
    lotteryId: number
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const lottery = await this.payload.findByID({
        collection: "lottery",
        id: lotteryId,
      });

      if (!lottery) {
        errors.push("Lottery not found");
        return { valid: false, errors };
      }

      if (!lottery.isActive) {
        errors.push("Lottery is not active");
      }

      const now = new Date();
      const endDate = new Date(lottery.endDate);

      if (now < endDate) {
        errors.push(
          `Lottery has not ended yet. Ends at: ${endDate.toISOString()}`
        );
      }

      const tickets = await this.payload.find({
        collection: "lottery-tickets",
        where: { lottery: { equals: lotteryId } },
        limit: 1,
      });

      if (tickets.docs.length === 0) {
        errors.push("No participants in this lottery");
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(
        `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      return { valid: false, errors };
    }
  }
}
