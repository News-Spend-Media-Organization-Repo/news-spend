import { addWeeks, startOfWeek } from "date-fns";
import { type CollectionConfig, ValidationError } from "payload";

import { LotteryEngine } from "../lib/lottery/LotteryEngine";
import { sendLotteryNotification } from "../lib/lottery-notification";

const Lotteries: CollectionConfig = {
  slug: "lottery",
  admin: {
    useAsTitle: "name",
    group: "Lottery",
    defaultColumns: ["name", "isActive", "endDate", "processedAt"],
  },
  access: {
    read: () => true,
  },
  hooks: {
    beforeValidate: [
      async ({ req, data, originalDoc, operation }) => {
        // Only one lottery may be active at a time. The current document is
        // excluded, otherwise editing an already-active lottery would find
        // itself and refuse the save.
        if (data?.isActive) {
          const activeLottery = await req.payload.find({
            collection: "lottery",
            where: { isActive: { equals: true } },
            limit: 1,
          });

          const clash = activeLottery.docs[0];
          if (clash && clash.id !== originalDoc?.id) {
            throw new ValidationError({
              collection: "lottery",
              errors: [
                {
                  path: "isActive",
                  message: `"${clash.name}" is already active. Only one lottery can be active at a time.`,
                },
              ],
              id: clash.id,
            });
          }
        }

        /**
         * Do not start a new lottery while an earlier one has passed its end
         * date without being drawn.
         *
         * A missed draw is how prizes get silently skipped: the old round is
         * left with paid-for tickets and no winners, while a new round takes
         * over the "active" slot and hides it. Blocking here also stops the
         * scheduled task from creating the next lottery when the current draw
         * has failed, which is safe only because the draw itself is now
         * idempotent, so the task's retries cannot double-award.
         */
        if (operation === "create") {
          const undrawn = await req.payload.find({
            collection: "lottery",
            where: {
              and: [
                { endDate: { less_than: new Date().toISOString() } },
                { processedAt: { exists: false } },
              ],
            },
            limit: 1,
            sort: "endDate",
          });

          const stuck = undrawn.docs[0];
          if (stuck) {
            throw new ValidationError({
              collection: "lottery",
              errors: [
                {
                  path: "name",
                  message: `"${stuck.name}" ended on ${new Date(stuck.endDate).toLocaleDateString("en-GB")} and has not been drawn yet. Run its draw before starting a new lottery.`,
                },
              ],
              id: stuck.id,
            });
          }
        }

        return data;
      },
    ],
  },
  endpoints: [
    {
      path: "/:id/run-draw",
      method: "post",
      handler: async (req) => {
        const user = req.user;

        // Drawing awards real prizes, so this is deliberately the narrowest
        // role. Widen here if operations staff need it.
        if (user?.collection !== "admins" || user?.role !== "super-admin") {
          return Response.json(
            { message: "Only a Super Admin can run a draw." },
            { status: 403 }
          );
        }

        const id = req.routeParams?.id as string | undefined;
        if (!id) {
          return Response.json(
            { message: "Missing lottery id." },
            { status: 400 }
          );
        }

        const lottery = await req.payload.findByID({
          collection: "lottery",
          id,
          depth: 0,
        });

        if (!lottery) {
          return Response.json(
            { message: "Lottery not found." },
            { status: 404 }
          );
        }

        if (lottery.processedAt) {
          return Response.json(
            {
              message: `This draw already ran on ${new Date(lottery.processedAt).toLocaleString("en-GB")}.`,
            },
            { status: 409 }
          );
        }

        if (new Date() < new Date(lottery.endDate)) {
          return Response.json(
            {
              message: `This lottery does not end until ${new Date(lottery.endDate).toLocaleString("en-GB")}.`,
            },
            { status: 409 }
          );
        }

        try {
          const engine = new LotteryEngine(req.payload);
          const result = await engine.runLottery(id);

          if ("alreadyProcessed" in result && result.alreadyProcessed) {
            return Response.json(
              {
                message: "This draw is already running or has been processed.",
              },
              { status: 409 }
            );
          }

          await sendLotteryNotification({
            lotteryId: id,
            payload: req.payload,
          });

          return Response.json({
            message: `Draw complete: ${result.totalWinners ?? 0} winners from ${result.totalParticipants ?? 0} participants.`,
            totalWinners: result.totalWinners ?? 0,
            totalParticipants: result.totalParticipants ?? 0,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          req.payload.logger.error(
            { err: error, lotteryId: id },
            "[lottery] manual draw failed"
          );
          return Response.json(
            { message: `Draw failed: ${message}` },
            { status: 500 }
          );
        }
      },
    },
  ],
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      unique: true,
      // the date in this format - 02032024
      defaultValue: () =>
        startOfWeek(new Date(), { weekStartsOn: 1 })
          .toLocaleDateString("en-GB")
          .replace(/\//g, ""),
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "startDate",
      type: "date",
      required: true,
      defaultValue: () =>
        startOfWeek(new Date(), {
          weekStartsOn: 1,
        }).toISOString(),
    },
    {
      name: "endDate",
      type: "date",
      required: true,
      // Set to Sunday of the current week
      defaultValue: () =>
        addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 2).toISOString(),
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: false,
    },
    {
      name: "runDraw",
      type: "ui",
      label: "Draw",
      admin: {
        components: {
          Field:
            "@news-spend-media/payload/components/RunLotteryDraw#RunLotteryDraw",
        },
      },
    },
    {
      name: "processing",
      type: "checkbox",
      defaultValue: false,
      admin: {
        readOnly: true,
        description:
          "Set while a draw is in progress. Blocks a second draw from starting.",
      },
    },
    {
      name: "processedAt",
      type: "date",
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        readOnly: true,
        description:
          "Stamped when the draw completes. Once set, the draw cannot run again.",
      },
    },
    {
      name: "drawSeed",
      type: "text",
      required: false,
      admin: {
        readOnly: true,
      },
    },
    {
      name: "ticketPrice",
      type: "number",
      required: true,
      defaultValue: 50,
    },
    {
      name: "winners",
      type: "relationship",
      relationTo: "users",
      hasMany: true,
    },
  ],
};

export default Lotteries;
