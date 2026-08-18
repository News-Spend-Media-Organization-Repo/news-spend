import {
  activities,
  lottery,
  lottery_tickets,
  users,
} from "@news-spend-media/payload/payload-generated-schema";
import type { LotteryTicket } from "@news-spend-media/payload/types";
import { and, desc, eq, sql } from "@payloadcms/db-postgres/drizzle";
import z from "zod";

import {
  protectedNoGuestProcedure,
  protectedProcedure,
  publicProcedure,
} from "../index";

/**
 * Upper bound on a single purchase. Not a business rule so much as a guard: the
 * quantity is multiplied by the ticket price to produce a points debit, so an
 * absurd value is worth rejecting outright rather than reasoning about.
 */
const MAX_TICKETS_PER_PURCHASE = 1000;

// Input schema for creating lottery tickets
export const CreateLotteryTicketInput = z.object({
  /**
   * Must be a positive whole number.
   *
   * This was a bare `z.number()`, which accepted negatives and decimals. A
   * negative quantity inverted the debit below — `-(-10 * 50)` credits 500
   * points — so a purchase of minus ten tickets minted points and reduced the
   * caller's ticket count.
   */
  num_of_tickets: z
    .number()
    .int("Ticket quantity must be a whole number.")
    .min(1, "You must buy at least one ticket.")
    .max(
      MAX_TICKETS_PER_PURCHASE,
      `You cannot buy more than ${MAX_TICKETS_PER_PURCHASE} tickets at once.`
    ),
});

export type CreateLotteryTicketInput = z.infer<typeof CreateLotteryTicketInput>;

// --- Procedures ---

const create = protectedNoGuestProcedure
  .input(CreateLotteryTicketInput)
  .handler(async ({ input, context, errors }) => {
    const { num_of_tickets } = input;
    const { user, payload } = context;
    const db = payload.db.drizzle;

    // Find current active lottery
    const currentLottery = await payload.find({
      collection: "lottery",
      where: { isActive: { equals: true } },
    });

    if (currentLottery.totalDocs < 1) {
      throw errors.NOT_FOUND({
        message: "No active giveaway",
      });
    }

    const activeLottery = currentLottery.docs[0];
    const ticketPrice = activeLottery?.ticketPrice ?? 1;
    const cost = num_of_tickets * ticketPrice;

    /**
     * Charge for the tickets before handing any out.
     *
     * The balance check used to compare points against the ticket *count* while
     * the debit was count × price, so at the default price of 50 a user holding
     * 10 points could buy 10 tickets and land at −490.
     *
     * Reading the balance and then writing the debit as two statements also let
     * two concurrent purchases both pass the check and overspend, so the read
     * and the write happen inside one transaction that first takes a row lock
     * on the user. Requests for the same user serialise on that lock; requests
     * for different users do not contend.
     *
     * The debit is committed before the tickets are granted. If granting then
     * fails the points are refunded below — the reverse order would hand out
     * tickets that were never paid for.
     */
    await db.transaction(async (tx) => {
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
          message: `Not enough points. ${num_of_tickets} ticket${num_of_tickets === 1 ? "" : "s"} costs ${cost} points and you have ${userPoints}.`,
        });
      }

      await tx.insert(activities).values({
        user: user.id,
        type: "point",
        action: "ticketPurchase",
        point: -cost,
        description: "Giveaway ticket purchase",
      });
    });

    try {
      // Check for existing ticket
      const existingTicket = await payload.find({
        collection: "lottery-tickets",
        where: {
          user: { equals: user.id },
          lottery: { equals: activeLottery?.id },
        },
      });

      let result: LotteryTicket;
      if (existingTicket.totalDocs > 0 && existingTicket.docs[0]) {
        result = await payload.update({
          collection: "lottery-tickets",
          id: existingTicket.docs[0].id,
          data: {
            count: existingTicket.docs[0].count + num_of_tickets,
          },
        });
      } else {
        result = await payload.create({
          collection: "lottery-tickets",
          data: {
            count: num_of_tickets,
            user: user.id,
            lottery: activeLottery?.id ?? "0",
            boostLuck: 0,
          },
        });
      }

      await payload.create({
        collection: "ticket-purchase-log",
        data: {
          user: user.id,
          lottery: activeLottery?.id ?? "0",
          ticketQuantity: num_of_tickets,
        },
      });

      return result;
    } catch (error) {
      // The points were already taken. Put them back rather than leave the user
      // charged for tickets they did not receive.
      await db
        .insert(activities)
        .values({
          user: user.id,
          type: "point",
          action: "ticketPurchase",
          point: cost,
          description: "Refund — giveaway ticket purchase failed",
        })
        .catch((refundError) => {
          payload.logger.error(
            { err: refundError, user: user.id, cost },
            "[lottery] failed to refund points after a failed ticket purchase"
          );
        });

      throw error;
    }
  });

const getByUser = protectedProcedure.handler(async ({ context }) => {
  const { user, payload } = context;
  const drizzle = payload.db.drizzle;
  const _db = payload.db;
  const result = await drizzle
    .select()
    .from(lottery_tickets)
    .innerJoin(lottery, eq(lottery_tickets.lottery, lottery.id))
    .where(and(eq(lottery.isActive, true), eq(lottery_tickets.user, user.id)))
    .limit(1);

  return result[0] ?? null;
});

const get = publicProcedure.handler(async ({ context }) => {
  const { payload } = context;
  const result = await payload.db.drizzle
    .select()
    .from(lottery_tickets)
    .innerJoin(lottery, eq(lottery_tickets.lottery, lottery.id))
    .where(eq(lottery.isActive, true));

  return result;
});

const purchaseLog = publicProcedure.handler(async ({ context }) => {
  const { payload } = context;
  const result = await payload.db.drizzle
    .select()
    .from(lottery_tickets)
    .innerJoin(lottery, eq(lottery_tickets.lottery, lottery.id))
    .innerJoin(users, eq(lottery_tickets.user, users.id))
    .where(eq(lottery.isActive, true))
    .orderBy(desc(lottery_tickets.createdAt))
    .limit(25);

  return result;
});

const boostLuck = protectedNoGuestProcedure.handler(
  async ({ context, errors }) => {
    const { user, payload } = context;
    const drizzle = payload.db.drizzle;
    const activeLottery = await payload.find({
      collection: "lottery",
      where: { isActive: { equals: true } },
    });

    const result = await drizzle
      .update(lottery_tickets)
      .set({
        boostLuck: sql`${lottery_tickets.boostLuck} + 1`,
      })
      .where(
        and(
          eq(lottery_tickets.user, user.id),
          eq(lottery_tickets.lottery, activeLottery.docs[0]?.id ?? "0")
        )
      )
      .returning();

    if (!result.length) {
      throw errors.NOT_FOUND({
        message: "No giveaway ticket found",
      });
    }

    return result;
  }
);

export const lotteryTicketRouter = {
  create,
  getByUser,
  get,
  purchaseLog,
  boostLuck,
};
