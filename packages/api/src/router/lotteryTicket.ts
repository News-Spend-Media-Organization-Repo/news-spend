import {
  activities,
  lottery,
  lottery_tickets,
  users,
} from "@news-spend-media/payload/payload-generated-schema";
import type { LotteryTicket } from "@news-spend-media/payload/types";
import { ORPCError } from "@orpc/client";
import { and, desc, eq, sql } from "@payloadcms/db-postgres/drizzle";
import z from "zod";

import { protectedNoGuestProcedure, protectedProcedure, publicProcedure } from "../index";
import { addActivity } from "../shared/activity";

// Input schema for creating lottery tickets
const CreateLotteryTicketInput = z.object({
  num_of_tickets: z.number(),
});

export type CreateLotteryTicketInput = z.infer<typeof CreateLotteryTicketInput>;

// --- Procedures ---

const create = protectedNoGuestProcedure
  .input(CreateLotteryTicketInput)
  .handler(async ({ input, context }) => {
    const { num_of_tickets } = input;
    const { user, payload } = context;
    const db = payload.db.drizzle;

    // Find current active lottery
    const currentLottery = await payload.find({
      collection: "lottery",
      where: { isActive: { equals: true } },
    });

    if (currentLottery.totalDocs < 1) {
      throw new ORPCError("NOT_FOUND", {
        message: "No active lottery",
      });
    }

    // Get user points
    const pointsQuery = await db
      .select({
        totalPoints: sql`COALESCE(SUM(${activities.point}), 0)`.mapWith(Number),
      })
      .from(activities)
      .where(eq(activities.user, user.id));

    const userPoints = pointsQuery[0]?.totalPoints ?? 0;

    if (userPoints < num_of_tickets) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Not enough tickets",
      });
    }

    // Check for existing ticket
    const existingTicket = await payload.find({
      collection: "lottery-tickets",
      where: {
        user: { equals: user.id },
        lottery: { equals: currentLottery.docs[0]?.id ?? 0 },
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
          lottery: currentLottery.docs[0]?.id ?? "0",
          boostLuck: 0,
        },
      });
    }

    await payload.create({
      collection: "ticket-purchase-log",
      data: {
        user: user.id,
        lottery: currentLottery.docs[0]?.id ?? "0",
        ticketQuantity: num_of_tickets,
      },
    });

    await addActivity(
      {
        type: "point",
        point: -(num_of_tickets * (currentLottery.docs[0]?.ticketPrice ?? 1)),
        description: "Lottery ticket purchase",
        action: "ticketPurchase",
      },
      context,
    );

    return result;
  });

const getByUser = protectedProcedure.handler(async ({ context }) => {
  const { user, payload } = context;
  const drizzle = payload.db.drizzle;
  const db = payload.db;
  const result = await drizzle
    .select()
    .from(lottery_tickets)
    .innerJoin(lottery, eq(lottery_tickets.lottery, lottery.id))
    .where(and(eq(lottery.isActive, true), eq(lottery_tickets.user, user.id)))
    .limit(1);

  return result[0];
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

const boostLuck = protectedNoGuestProcedure.handler(async ({ context }) => {
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
        eq(lottery_tickets.lottery, activeLottery.docs[0]?.id ?? "0"),
      ),
    )
    .returning();

  if (!result.length) {
    throw new ORPCError("NOT_FOUND", {
      message: "No lottery ticket found",
    });
  }

  return result;
});

export const lotteryTicketRouter = {
  create,
  getByUser,
  get,
  purchaseLog,
  boostLuck,
};
