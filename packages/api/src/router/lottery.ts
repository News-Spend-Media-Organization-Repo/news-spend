import { lottery_winners } from "@news-spend-media/payload/payload-generated-schema";
import type { Media } from "@news-spend-media/payload/types";
import { ORPCError } from "@orpc/client";
import { and, eq, ne } from "@payloadcms/db-postgres/drizzle";
import { subWeeks } from "date-fns";
import z from "zod";
import { zfd } from "zod-form-data";

import {
  protectedNoGuestProcedure,
  protectedProcedure,
  publicProcedure,
} from "../index";
import { addActivity } from "../shared/activity";

// --- Schemas ---
const LotteryCreateInput = z.object({
  name: z
    .string()
    .default(
      () =>
        new Date().getDay() +
        new Date().getMonth() +
        new Date().getFullYear().toString()
    ),
  active: z.boolean().default(true),
});

export type LotteryCreateInput = z.infer<typeof LotteryCreateInput>;

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const verifyIdentityInput = zfd.formData({
  firstName: zfd.text(z.string().trim().min(3)),
  lastName: zfd.text(z.string().trim().min(3)),
  email: zfd.text(z.string().email()),
  phoneNumber: zfd.text(
    z.string().trim().regex(/^\d+$/, "Invalid phone number")
  ),
  shippingAddress: zfd.text(z.string().trim().min(3)),
  "governmentId.front": zfd
    .file()
    .refine(
      (file) => file && file.size <= MAX_FILE_SIZE,
      "File size must be less than 5MB"
    ),
  "governmentId.back": zfd
    .file()
    .refine(
      (file) => file && file.size <= MAX_FILE_SIZE,
      "File size must be less than 5MB"
    ),
});

export type VerifyIdentityInput = z.infer<typeof verifyIdentityInput>;

// --- Procedures ---

const all = publicProcedure.handler(async ({ context }) =>
  context.payload.find({
    collection: "lottery",
    pagination: false,
    sort: "-createdAt",
  })
);

const one = publicProcedure
  .input(z.number())
  .handler(async ({ input: id, context }) =>
    context.payload.findByID({
      id,
      collection: "lottery",
    })
  );

const current = publicProcedure.handler(async ({ context }) => {
  const result = await context.payload.find({
    collection: "lottery",
    where: { isActive: { equals: true } },
  });
  return result.docs[0] ?? null;
});

const _create = publicProcedure
  .input(LotteryCreateInput)
  .handler(async ({ input, context }) =>
    context.payload.create({
      collection: "lottery",
      data: {
        isActive: input.active ?? false,
        name:
          input.name ??
          new Date().getDay() +
            new Date().getMonth() +
            new Date().getFullYear(),
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ticketPrice: 3,
      },
    })
  );

const getReward = protectedProcedure.handler(async ({ context }) => {
  const _oneWeekAgo = subWeeks(new Date(), 1);
  const result = await context.payload.find({
    collection: "lottery-winners",
    depth: 0,
    where: {
      user: { equals: context.user.id },
      claimed: { not_equals: true },
      // createdAt: { greater_than_equal: oneWeekAgo },
    },
  });

  return result.docs[0] ?? null;
});

const claimReward = protectedProcedure
  .input(z.object({ winnerId: z.string() }))
  .handler(async ({ input, context }) => {
    const { payload, user } = context;

    // Fetch winner to get prize info
    const winner = await payload.findByID({
      collection: "lottery-winners",
      id: input.winnerId,
      depth: 1,
    });

    const lotteryWinnerId =
      typeof winner.user === "string" ? winner.user : winner.user.id;

    if (!winner || lotteryWinnerId !== user.id) {
      throw new ORPCError("NOT_FOUND", {
        message: "Winner not found",
      });
    }

    // Atomically mark as claimed only if it isn't already, so two
    // concurrent/duplicate claim calls for the same winnerId can't both
    // pass the check and double-award points (a plain read-then-write
    // has a race window this closes at the DB level).
    const claimedRows = await payload.db.drizzle
      .update(lottery_winners)
      .set({
        claimed: true,
        claimedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(lottery_winners.id, input.winnerId),
          ne(lottery_winners.claimed, true)
        )
      )
      .returning();

    if (claimedRows.length === 0) {
      throw new ORPCError("CONFLICT", {
        message: "Reward already claimed",
      });
    }

    const result = claimedRows[0];

    // Add points for LOW tier
    if (winner.prizeTier === "LOW" && winner.prize) {
      const points = Number.parseInt(winner.prize, 10);
      if (!Number.isNaN(points)) {
        await addActivity(
          {
            type: "point",
            point: points,
            action: "lottery",
            description: "Giveaway reward claimed",
          },
          context
        );
      }
    }

    return result;
  });

const verifyIdentity = protectedNoGuestProcedure
  .input(verifyIdentityInput)
  .handler(async ({ input, context }) => {
    const { payload, user } = context;
    const ongoingVerification = await payload.find({
      collection: "identity-verification",
      depth: 0,
      where: {
        user: {
          equals: user.id,
        },
      },
    });

    if (ongoingVerification.docs.length > 0) {
      // const result = await payload.update({
      //   collection: "identity-verification",
      //   id: ongoingVerification.docs[0].id,
      //   data: {
      //     user: user.id,
      //     ...input,
      //   },
      // });

      // return result;
      return ongoingVerification.docs[0];
    }

    // upload files first
    let files: Media[] = [];
    const transactionID = await payload.db.beginTransaction();
    try {
      const {
        "governmentId.front": frontFile,
        "governmentId.back": backFile,
        ...rest
      } = input;
      files = await Promise.all([
        payload.create({
          collection: "media",
          data: {
            alt: frontFile.name,
            mimeType: frontFile.type,
            filename: frontFile.name,
            filesize: frontFile.size,
          },
          file: {
            data: Buffer.from(await frontFile.arrayBuffer()),
            mimetype: frontFile.type,
            name: frontFile.name,
            size: frontFile.size,
          },
          // @ts-expect-error
          req: { transactionID },
        }),
        payload.create({
          collection: "media",
          data: {
            alt: backFile.name,
            mimeType: backFile.type,
            filename: backFile.name,
            filesize: backFile.size,
          },
          file: {
            data: Buffer.from(await backFile.arrayBuffer()),
            mimetype: backFile.type,
            name: backFile.name,
            size: backFile.size,
          },
          // @ts-expect-error
          req: { transactionID },
        }),
      ]);

      if (!(files[0] && files[1])) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "File upload failed",
        });
      }

      const result = await payload.create({
        collection: "identity-verification",
        data: {
          user: user.id,
          governmentId: {
            front: files[0].id,
            back: files[1].id,
          },
          ...rest,
        },
        // @ts-expect-error
        req: { transactionID },
      });

      // @ts-expect-error
      await payload.db.commitTransaction(transactionID);
      return result;
    } catch (error) {
      // @ts-expect-error
      await payload.db.rollbackTransaction(transactionID);

      if (files.length > 0) {
        await payload.delete({
          collection: "media",
          where: {
            id: {
              in: files.map((file) => file.id),
            },
          },
        });
      }

      throw error;
    }
  });

const identityStatus = protectedNoGuestProcedure.handler(
  async ({ context }) => {
    const result = await context.payload.find({
      collection: "identity-verification",
      depth: 0,
      where: { user: { equals: context.user.id } },
    });
    return result.docs[0] ?? null;
  }
);

/**
 * `processLottery` used to live here as an unauthenticated procedure: anyone
 * who could reach the API could trigger the draw. It was removed rather than
 * protected, because oRPC procedures authenticate app users, not CMS admins —
 * the strongest available guard would still have meant "any signed-in user can
 * run the draw".
 *
 * Manual triggering is now POST /api/lottery/:id/run-draw, which is restricted
 * to Super Admins and backed by the "Run draw now" button on the lottery. The
 * scheduled path is unchanged: the cron in apps/server queues the
 * `processLottery` job directly.
 */

export const lotteryRouter = {
  all,
  one,
  current,
  // create,
  getReward,
  claimReward,
  verifyIdentity,
  identityStatus,
};
