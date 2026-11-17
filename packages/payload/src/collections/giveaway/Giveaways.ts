import { addWeeks, startOfWeek } from "date-fns";
import { APIError, type CollectionConfig, ValidationError } from "payload";
import { isStaff } from "../../access/adminRoles";
import { giveawayStatsView } from "../../components/Analytics/tabs";
import { giveawaySetupGuideView } from "../../components/GiveawaySetupGuide/tabs";
import {
  normalisePlaceholders,
  validatePlaceholders,
} from "../../lib/personalise";
import {
  ADMIN_GROUP,
  DRAW_CHECKPOINT_OPTIONS,
  GIVEAWAY_ANNOUNCEMENT_TITLE,
  GIVEAWAY_DESCRIPTION_MAX_LENGTH,
  GIVEAWAY_STATUS_OPTIONS,
  type GiveawayStatus,
  isConfigurationLocked,
  MANUAL_WINNER_REASON_MAX_LENGTH,
} from "./constants";

/**
 * Core giveaway configuration (spec 1, 3).
 *
 * The administrator configures exactly four things: ticket price, the maximum
 * winner percentage per tier, the prize pool (see `giveaway-prizes`), and the
 * maximum units per selected prize (also on `giveaway-prizes`). Tier
 * eligibility rules are platform business logic and are not represented here.
 */

/**
 * The Notification section is only worth showing when a push will actually
 * go out. `sendAnnouncement` defaults to on, so anything not explicitly
 * switched off still shows it.
 */
export function showNotificationSection(
  data:
    | {
        sendAnnouncement?: boolean | null;
      }
    | null
    | undefined
): boolean {
  return data?.sendAnnouncement !== false;
}

export const Giveaways: CollectionConfig = {
  slug: "giveaways",
  admin: {
    group: ADMIN_GROUP,
    useAsTitle: "name",
    defaultColumns: [
      "name",
      "status",
      "startDate",
      "endDate",
      "totalValidParticipants",
    ],
    components: {
      views: {
        edit: { stats: giveawayStatsView, setupGuide: giveawaySetupGuideView },
      },
    },
  },
  access: {
    read: isStaff,
  },
  endpoints: [
    {
      /**
       * Run (or resume) this giveaway's draw by hand.
       *
       * The hourly sweep is the normal path and remains so. This exists for the
       * two cases it cannot serve: a draw that must run early or be re-run
       * after a failure, and a draw an administrator has authorized to resume
       * (19), the sweep only ever selects `active` giveaways, so without this
       * a resumption would never execute at all.
       *
       * Every rule about *whether* a draw may run stays in the engine's own
       * validation rather than being restated here, so the button, the sweep
       * and this endpoint can never disagree about it.
       */
      /**
       * What could this giveaway award, at a given number of participants?
       *
       * Read-only and unauthenticated by nothing: it writes nothing, starts
       * nothing and touches no winner. Available to any admin rather than
       * super-admins alone, because the whole point is that it should be
       * consulted freely while a pool is being decided, and a check people
       * need permission for is a check they skip.
       */
      path: "/:id/simulate",
      method: "post",
      handler: async (req) => {
        if (req.user?.collection !== "admins") {
          return Response.json({ message: "Admins only." }, { status: 403 });
        }

        const id = req.routeParams?.id as string | undefined;
        if (!id) {
          return Response.json(
            { message: "Missing giveaway id." },
            { status: 400 }
          );
        }

        const body = req.json
          ? ((await req.json()) as {
              participants?: number;
              eligible?: Record<string, number>;
            })
          : {};

        const participants = Number(body.participants ?? 0);
        if (!Number.isFinite(participants) || participants < 0) {
          return Response.json(
            { message: "participants must be a number of 0 or more." },
            { status: 400 }
          );
        }

        const { simulateDraw } = await import(
          "../../lib/giveaway/simulateDraw"
        );

        try {
          const result = await simulateDraw(req.payload, id, {
            participants,
            eligible: body.eligible as never,
          });
          return Response.json(result);
        } catch (error) {
          req.payload.logger.error(
            { err: error, giveawayId: id },
            "[giveaway] simulation failed"
          );
          return Response.json(
            { message: "Could not simulate this giveaway." },
            { status: 500 }
          );
        }
      },
    },
    {
      /**
       * Prize-pool notice for the admin giveaway screen.
       *
       * Read-only: it writes nothing and starts nothing. Returns the pool
       * errors that would refuse a draw, plus the simulation warnings for a
       * pool that is merely thin, computed against the current count of
       * distinct valid-ticket holders so no estimate has to be typed in.
       * Available to any admin, because a check people need permission for
       * is a check they skip.
       */
      path: "/:id/pool-notice",
      method: "get",
      handler: async (req) => {
        if (req.user?.collection !== "admins") {
          return Response.json({ message: "Admins only." }, { status: 403 });
        }

        const id = req.routeParams?.id as string | undefined;
        if (!id) {
          return Response.json(
            { message: "Missing giveaway id." },
            { status: 400 }
          );
        }

        const giveaway = await req.payload.findByID({
          collection: "giveaways",
          id,
          depth: 0,
        });
        if (!giveaway) {
          return Response.json(
            { message: "Giveaway not found." },
            { status: 404 }
          );
        }

        const { GiveawayEngine } = await import(
          "../../lib/giveaway/GiveawayEngine"
        );
        const { simulateDraw } = await import(
          "../../lib/giveaway/simulateDraw"
        );

        const tickets = await req.payload.find({
          collection: "giveaway-tickets",
          where: {
            and: [
              { giveaway: { equals: id } },
              { status: { equals: "valid" } },
            ],
          },
          pagination: false,
          depth: 0,
        });

        // One head per person: winner percentages apply to participants,
        // not to tickets.
        const participants = new Set(
          tickets.docs
            .map((ticket) =>
              typeof ticket.user === "string"
                ? ticket.user
                : String((ticket.user as { id?: string } | null)?.id ?? "")
            )
            .filter(Boolean)
        ).size;

        const [pool, simulation, prizeRows] = await Promise.all([
          new GiveawayEngine(req.payload).validatePrizePool(giveaway),
          simulateDraw(req.payload, id, { participants }),
          req.payload.find({
            collection: "giveaway-prizes",
            where: { giveaway: { equals: id } },
            pagination: false,
            depth: 0,
          }),
        ]);

        // What is stocked under each tier, beside the percentage that
        // enables it: a tier with a percentage and no rows is the usual
        // reason a draw refuses.
        const breakdown = (
          [
            ["tier1", giveaway.tier1WinnerPercentage],
            ["tier2", giveaway.tier2WinnerPercentage],
            ["tier3", giveaway.tier3WinnerPercentage],
          ] as const
        ).map(([tier, winnerPercentage]) => {
          const rows = prizeRows.docs.filter((row) => row.tier === tier);
          return {
            tier,
            winnerPercentage,
            prizes: rows.length,
            units: rows.reduce((sum, row) => sum + (row.maxUnits ?? 0), 0),
          };
        });

        return Response.json({
          participants,
          breakdown,
          errors: pool.errors,
          warnings: [...pool.warnings, ...simulation.warnings],
          tiers: simulation.tiers,
        });
      },
    },
    {
      path: "/:id/run-draw",
      method: "post",
      handler: async (req) => {
        const user = req.user;

        // A draw awards real prizes and cannot be undone, so this is
        // deliberately the narrowest role.
        if (user?.collection !== "admins" || user?.role !== "super-admin") {
          return Response.json(
            { message: "Only a Super Admin can run a draw." },
            { status: 403 }
          );
        }

        const id = req.routeParams?.id as string | undefined;
        if (!id) {
          return Response.json(
            { message: "Missing giveaway id." },
            { status: 400 }
          );
        }

        const body = req.json
          ? ((await req.json()) as { resume?: boolean })
          : {};
        const resume = body.resume === true;

        const { GiveawayEngine, GiveawayEngineError } = await import(
          "../../lib/giveaway/GiveawayEngine"
        );

        try {
          const result = await new GiveawayEngine(req.payload).runDraw(id, {
            resume,
            // An administrator is pressing the button and reads the refusal in
            // the response below, so there is nothing for a status change to
            // tell them. Leaving the giveaway open lets them fix what
            // validation named and press it again; the scheduled task, which
            // has nobody to read anything, keeps the default.
            recordValidationFailure: false,
          });

          return Response.json({
            message: `Draw complete: ${result.totalWinners} winner${
              result.totalWinners === 1 ? "" : "s"
            } from ${result.totalValidParticipants} participant${
              result.totalValidParticipants === 1 ? "" : "s"
            }.`,
            totalWinners: result.totalWinners,
            totalValidParticipants: result.totalValidParticipants,
            executionId: result.executionId,
            warnings: result.warnings,
          });
        } catch (error) {
          /**
           * A refused draw is an ordinary answer, not a fault: the countdown
           * has not ended, prizes are unconfigured, a draw is already running.
           * The engine phrases each of those for an administrator, so its
           * message is returned verbatim as a 409 rather than being flattened
           * into a generic failure.
           */
          if (error instanceof GiveawayEngineError) {
            req.payload.logger.warn(
              { giveawayId: id, code: error.code, resume },
              "[giveaway] manual draw refused"
            );
            return Response.json(
              { message: error.message, code: error.code },
              { status: 409 }
            );
          }

          const message =
            error instanceof Error ? error.message : "Unknown error";
          req.payload.logger.error(
            { err: error, giveawayId: id, resume },
            "[giveaway] manual draw failed"
          );
          return Response.json(
            { message: `Draw failed: ${message}` },
            { status: 500 }
          );
        }
      },
    },
    {
      /**
       * Who can still be seated as a manual winner, and the prizes on offer.
       *
       * Super-admin only: the rows carry participants' names and emails, and
       * the only thing they are for is the action below.
       */
      path: "/:id/participants",
      method: "get",
      handler: async (req) => {
        const user = req.user;
        if (user?.collection !== "admins" || user?.role !== "super-admin") {
          return Response.json(
            { message: "Only a Super Admin can pick winners." },
            { status: 403 }
          );
        }

        const id = req.routeParams?.id as string | undefined;
        if (!id) {
          return Response.json(
            { message: "Missing giveaway id." },
            { status: 400 }
          );
        }

        const params = req.searchParams;
        const page = Number(params?.get("page") ?? "");
        const limit = Number(params?.get("limit") ?? "");

        const { GiveawayEngine } = await import(
          "../../lib/giveaway/GiveawayEngine"
        );
        const listing = await new GiveawayEngine(req.payload).listParticipants(
          id,
          {
            search: params?.get("search") ?? undefined,
            page: Number.isFinite(page) && page > 0 ? page : undefined,
            limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
          }
        );
        return Response.json(listing);
      },
    },
    {
      /**
       * Seat a chosen participant as a winner, in addition to the draw.
       *
       * One pick per request, so one bad row in a batch is reported on its own
       * rather than failing the others. Refusals are the engine's own words,
       * as a 409, the same way `/run-draw` returns them.
       */
      path: "/:id/manual-winner",
      method: "post",
      handler: async (req) => {
        const user = req.user;
        if (user?.collection !== "admins" || user?.role !== "super-admin") {
          return Response.json(
            { message: "Only a Super Admin can pick winners." },
            { status: 403 }
          );
        }

        const id = req.routeParams?.id as string | undefined;
        if (!id) {
          return Response.json(
            { message: "Missing giveaway id." },
            { status: 400 }
          );
        }

        const body = (req.json ? await req.json() : {}) as {
          userKey?: unknown;
          prizeRowId?: unknown;
          reason?: unknown;
        };
        const { userKey, prizeRowId } = body;
        if (
          typeof userKey !== "string" ||
          userKey.length === 0 ||
          typeof prizeRowId !== "string" ||
          prizeRowId.length === 0
        ) {
          return Response.json(
            { message: "Choose a person and a prize." },
            { status: 400 }
          );
        }

        const reason =
          typeof body.reason === "string" && body.reason.trim().length > 0
            ? body.reason.trim()
            : undefined;
        if (reason && reason.length > MANUAL_WINNER_REASON_MAX_LENGTH) {
          return Response.json(
            {
              message: `Keep the reason to ${MANUAL_WINNER_REASON_MAX_LENGTH} characters.`,
            },
            { status: 400 }
          );
        }

        const { GiveawayEngine, GiveawayEngineError } = await import(
          "../../lib/giveaway/GiveawayEngine"
        );

        try {
          const result = await new GiveawayEngine(req.payload).addManualWinner(
            id,
            {
              userKey,
              prizeRowId,
              addedBy: user.email ?? String(user.id),
              reason,
            }
          );

          return Response.json({
            message:
              result.phase === "post_draw"
                ? "Winner added. The Winner Report has already been sent and does not include them; resend it from Winner Report."
                : "Winner added. The draw will skip them.",
            ...result,
          });
        } catch (error) {
          if (error instanceof GiveawayEngineError) {
            req.payload.logger.warn(
              { giveawayId: id, code: error.code },
              "[giveaway] manual winner refused"
            );
            return Response.json(
              { message: error.message, code: error.code },
              { status: 409 }
            );
          }

          req.payload.logger.error(
            { err: error, giveawayId: id },
            "[giveaway] manual winner failed"
          );
          const message =
            error instanceof Error ? error.message : "Unknown error";
          return Response.json(
            { message: `Could not add the winner: ${message}` },
            { status: 500 }
          );
        }
      },
    },
    {
      /**
       * Authorize a stopped draw to resume (19).
       *
       * The status alone is what the engine checks, so an administrator can
       * reach `resumption_authorized` by editing the select, and that is how
       * it was done before this existed. It works, and it records nothing: no
       * name, no timestamp, no audit entry, because the stamping lives in
       * `authorizeResumption` rather than in the field.
       *
       * 19 exists so a draw can be defended afterwards. "Someone changed a
       * dropdown" is the wrong answer to who allowed prizes to be awarded, so
       * this routes the same decision through the engine, which records it.
       */
      path: "/:id/authorize-resumption",
      method: "post",
      handler: async (req) => {
        const user = req.user;

        if (user?.collection !== "admins" || user?.role !== "super-admin") {
          return Response.json(
            { message: "Only a Super Admin can authorize a resumption." },
            { status: 403 }
          );
        }

        const id = req.routeParams?.id as string | undefined;
        if (!id) {
          return Response.json(
            { message: "Missing giveaway id." },
            { status: 400 }
          );
        }

        const body = req.json ? ((await req.json()) as { note?: string }) : {};

        const { GiveawayEngine } = await import(
          "../../lib/giveaway/GiveawayEngine"
        );

        const result = await new GiveawayEngine(
          req.payload
        ).authorizeResumption(id, {
          // Identifies the person in the audit log and on the attempt.
          authorizedBy: user.email ?? String(user.id),
          note: body.note,
        });

        if (result.authorized) {
          return Response.json({
            message: result.message ?? "Resumption authorized.",
          });
        }

        return Response.json({ message: result.message }, { status: 409 });
      },
    },
    {
      /**
       * Resend the Winner Report (spec 21, "provide Resend Winner Report
       * button in CMS").
       *
       * A resend is recorded as its own delivery rather than overwriting the
       * original, so the log always answers "when did the report first go
       * out, and how many times has it been sent since?".
       */
      path: "/:id/resend-winner-report",
      method: "post",
      handler: async (req) => {
        const user = req.user;

        // The report carries winners' names, emails and phone numbers, so
        // sending it is deliberately the narrowest role.
        if (user?.collection !== "admins" || user?.role !== "super-admin") {
          return Response.json(
            { message: "Only a Super Admin can send the Winner Report." },
            { status: 403 }
          );
        }

        const id = req.routeParams?.id as string | undefined;
        if (!id) {
          return Response.json(
            { message: "Missing giveaway id." },
            { status: 400 }
          );
        }

        const { sendWinnerReport } = await import(
          "../../lib/giveaway/sendWinnerReport"
        );

        const result = await sendWinnerReport(req.payload, id, {
          kind: "resend",
          requestedBy: user.email ?? String(user.id),
        });

        if (result.sent) {
          return Response.json({ message: "Winner Report sent." });
        }

        return Response.json({ message: result.message }, { status: 409 });
      },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ req, data, originalDoc, operation }) => {
        if (data) {
          for (const field of [
            "description",
            "notificationTitle",
            "notificationBody",
          ] as const) {
            const value = data[field];
            if (typeof value === "string") {
              data[field] = normalisePlaceholders(value);
            }
          }
        }

        const nextStatus = data?.status as GiveawayStatus | undefined;
        const prevStatus = originalDoc?.status as GiveawayStatus | undefined;

        // Only one giveaway may be active at a time.
        if (nextStatus === "active" && prevStatus !== "active") {
          const active = await req.payload.find({
            collection: "giveaways",
            where: { status: { equals: "active" } },
            limit: 1,
            pagination: false,
          });

          const clash = active.docs[0];
          if (clash && clash.id !== originalDoc?.id) {
            /**
             * `APIError`, not `ValidationError`, because this message is the
             * whole value of the error.
             *
             * `ValidationError` composes its own message from the field path
             * and discards the per-error `message`, so the administrator saw
             * "The following field is invalid: status" and had to go and work
             * out for themselves which giveaway was holding the slot. The one
             * fact that resolves the situation — the name of the giveaway to
             * close out first — never reached them. `APIError`'s message is
             * shown verbatim.
             */
            throw new APIError(
              `"${clash.name}" is already active, and only one giveaway may be active at a time. Set "${clash.name}" to Completed or Cancelled first, then activate this one.`,
              400
            );
          }
        }

        // Configuration locks when the draw begins (spec 5, 16).
        if (
          operation === "update" &&
          prevStatus &&
          originalDoc &&
          isConfigurationLocked(originalDoc)
        ) {
          const lockedFields = [
            "ticketPrice",
            "tier1WinnerPercentage",
            "tier2WinnerPercentage",
            "tier3WinnerPercentage",
            "minTicketsRequired",
            "budgetUtilizationPct",
            "maxBudgetCapNaira",
            "startDate",
            "endDate",
          ] as const;

          const mutated = lockedFields.filter(
            (field) =>
              data?.[field] !== undefined &&
              data[field] !== originalDoc?.[field]
          );

          if (mutated.length > 0) {
            throw new ValidationError({
              collection: "giveaways",
              errors: mutated.map((path) => ({
                path,
                message: `Cannot be changed once the draw has begun (giveaway is "${prevStatus}").`,
              })),
            });
          }
        }

        if (
          data?.startDate &&
          data?.endDate &&
          new Date(data.endDate) <= new Date(data.startDate)
        ) {
          throw new ValidationError({
            collection: "giveaways",
            errors: [
              {
                path: "endDate",
                message: "End date must be after start date.",
              },
            ],
          });
        }

        return data;
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        const becameActive =
          doc.status === "active" &&
          (operation === "create" || previousDoc?.status !== "active");

        // One push per giveaway, the first time it goes live. Drafting it again
        // and re-activating must stay quiet, exactly as re-publishing an
        // article does (`hasBeenPublished`).
        if (becameActive && doc.hasBeenAnnounced !== true) {
          const { announceGiveaway } = await import(
            "../../lib/giveaway/announceGiveaway"
          );
          const result = await announceGiveaway(doc, req);

          // A failed queueing keeps the flag off so a later save can retry;
          // switching the push off for this activation still counts as done,
          // or a later edit would send the announcement late.
          if (result.reason !== "error") {
            await req.payload.update({
              collection: "giveaways",
              id: doc.id,
              data: { hasBeenAnnounced: true },
              req,
            });
          }
        }

        return doc;
      },
    ],
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      unique: true,
      defaultValue: () =>
        startOfWeek(new Date(), { weekStartsOn: 1 })
          .toLocaleDateString("en-GB")
          .replace(/\//g, ""),
    },
    {
      name: "description",
      type: "textarea",
      maxLength: GIVEAWAY_DESCRIPTION_MAX_LENGTH,
      validate: validatePlaceholders,
      admin: {
        description: `Shown on the giveaway screen, and sent as the push notification body when this giveaway is set to Active. Write {{firstName}} to address each user by first name, e.g. "{{firstName}}, join 1500 winners". Max ${GIVEAWAY_DESCRIPTION_MAX_LENGTH} characters so it is not cut off on a lock screen.`,
      },
    },
    {
      name: "sendAnnouncement",
      type: "checkbox",
      defaultValue: true,
      label: "Send push notification when this giveaway goes Active",
      admin: {
        description:
          "On by default. Switch off to activate the giveaway without notifying users. Uses the notification title and body below as the message; when the body is left blank the description above is sent instead, and nothing is sent if both are empty.",
      },
    },
    {
      name: "hasBeenAnnounced",
      type: "checkbox",
      defaultValue: false,
      admin: {
        readOnly: true,
        position: "sidebar",
        hidden: process.env.NODE_ENV !== "development",
        description:
          "Set once the activation notification has been handled. Prevents a second push when this giveaway is drafted and activated again.",
      },
    },
    {
      type: "collapsible",
      label: "Notification",
      admin: {
        description:
          "What users receive when this giveaway goes Active. Kept apart from the giveaway itself so push copy never leaks into the draw.",
        condition: (data) => showNotificationSection(data),
      },
      fields: [
        {
          name: "notificationTitle",
          type: "text",
          defaultValue: GIVEAWAY_ANNOUNCEMENT_TITLE,
          validate: validatePlaceholders,
          admin: {
            description:
              "Push title. Write {{firstName}} to address each user by first name, e.g. '{{firstName}}, a giveaway is live'. Each user sees their own first name in its place.",
          },
        },
        {
          name: "notificationBody",
          type: "textarea",
          maxLength: GIVEAWAY_DESCRIPTION_MAX_LENGTH,
          validate: validatePlaceholders,
          admin: {
            description: `Optional push body. Write {{firstName}} to address each user by first name. Left blank, the description above is sent instead so existing giveaways keep working; nothing is sent if both are empty. Max ${GIVEAWAY_DESCRIPTION_MAX_LENGTH} characters so it is not cut off on a lock screen.`,
          },
        },
      ],
    },
    {
      name: "startDate",
      type: "date",
      required: true,
      admin: { date: { pickerAppearance: "dayAndTime" } },
      defaultValue: () =>
        startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString(),
    },
    {
      name: "endDate",
      type: "date",
      required: true,
      admin: {
        date: { pickerAppearance: "dayAndTime" },
        description:
          "When the countdown ends and the draw becomes eligible to run.",
      },
      defaultValue: () =>
        addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 2).toISOString(),
    },
    {
      name: "ticketPrice",
      type: "number",
      required: true,
      min: 0,
      defaultValue: 50,
      admin: { description: "Points charged per ticket." },
    },
    {
      name: "minTicketsRequired",
      label: "Minimum tickets per purchase",
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
      admin: {
        description:
          "The smallest number of tickets a user may buy at once (spec 1). This is a purchase floor, not a tier requirement.",
      },
      validate: (value: number | null | undefined) => {
        if (value === null || value === undefined) {
          return "A minimum is required. Use 1 for no restriction.";
        }
        if (!Number.isInteger(value) || value < 1) {
          return "Must be a whole number of at least 1.";
        }
        return true;
      },
    },
    {
      type: "collapsible",
      label: "Winner Distribution",
      admin: {
        description:
          "Each percentage is a ceiling on winners in that tier, not a target. It is a share of participants (people with at least one valid ticket), rounded down: at 8 participants and 25%, the tier can have at most 2 winners. The real number is also limited by the prize units stocked for the tier and by how many users meet the tier's entry requirements (see the Setup Guide). Real giveaways use the defaults (0.1 / 0.5 / 5); high values are only for small test runs. Enter 0 to disable a tier.",
      },
      fields: [
        winnerPercentageField("tier1WinnerPercentage", "Tier 1 (%)", 0.1),
        winnerPercentageField("tier2WinnerPercentage", "Tier 2 (%)", 0.5),
        winnerPercentageField("tier3WinnerPercentage", "Tier 3 (%)", 5),
      ],
    },
    {
      type: "collapsible",
      label: "Budget Reserve",
      admin: {
        description:
          "Optional spending limits. Both are inert at their defaults, so a giveaway behaves exactly as the specification describes unless these are deliberately changed.",
      },
      fields: [
        {
          name: "budgetUtilizationPct",
          label: "Maximum budget utilisation (%)",
          type: "number",
          required: true,
          min: 1,
          max: 100,
          defaultValue: 100,
          admin: {
            step: 1,
            description:
              "The share of stocked prize units this draw may award. 100 means the Maximum Units figures are the only ceiling; 85 would hold 15% of the stock back for later giveaways.",
          },
          validate: (value: number | null | undefined) => {
            if (value === null || value === undefined) {
              return "A utilisation percentage is required.";
            }
            if (!Number.isFinite(value) || value <= 0 || value > 100) {
              return "Must be greater than 0 and at most 100.";
            }
            return true;
          },
        },
        {
          name: "maxBudgetCapNaira",
          label: "Hard spend cap (₦)",
          type: "number",
          min: 0,
          admin: {
            description:
              "Total retail value this draw may award: a ceiling, not a target. Coming in under it is the normal case. Leave empty for no monetary cap. Prizes with no Value (₦) count as ₦0 against it, so the cap only ever binds priced prizes.",
          },
        },
      ],
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      index: true,
      options: [...GIVEAWAY_STATUS_OPTIONS],
      admin: { position: "sidebar" },
    },
    {
      name: "totalValidParticipants",
      type: "number",
      admin: {
        readOnly: true,
        position: "sidebar",
        description:
          "Unique users holding at least one valid ticket, captured once when the draw begins. Constant for the whole draw.",
      },
    },
    {
      name: "drawSeed",
      type: "text",
      admin: {
        readOnly: true,
        position: "sidebar",
        description:
          "Cryptographic seed used for this draw. Enables replay for audit.",
      },
    },
    {
      name: "drawExecutionId",
      type: "text",
      index: true,
      admin: {
        readOnly: true,
        position: "sidebar",
        description:
          "Identifies this draw across every attempt at it. A resumption reuses it rather than starting a new one (19).",
      },
    },
    {
      name: "lastCheckpoint",
      type: "select",
      options: [...DRAW_CHECKPOINT_OPTIONS],
      admin: {
        readOnly: true,
        position: "sidebar",
        description:
          "The last material step the draw completed. A resumption continues from the next one (19).",
      },
    },
    {
      name: "currentAttempt",
      type: "relationship",
      relationTo: "giveaway-draw-attempts",
      admin: {
        readOnly: true,
        position: "sidebar",
        description: "The most recent execution attempt.",
      },
    },
    {
      name: "resumptionAuthorizedBy",
      type: "text",
      admin: {
        readOnly: true,
        position: "sidebar",
        condition: (data) =>
          data?.status === "resumption_authorized" ||
          data?.status === "interrupted",
      },
    },
    {
      name: "resumptionAuthorizedAt",
      type: "date",
      admin: {
        readOnly: true,
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
        condition: (data) => Boolean(data?.resumptionAuthorizedBy),
      },
    },
    {
      name: "drawStartedAt",
      type: "date",
      admin: {
        readOnly: true,
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "drawCompletedAt",
      type: "date",
      admin: {
        readOnly: true,
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "drawError",
      type: "textarea",
      admin: {
        readOnly: true,
        position: "sidebar",
        condition: (data) =>
          data?.status === "failed" || data?.status === "interrupted",
      },
    },
    {
      name: "prizes",
      type: "join",
      collection: "giveaway-prizes",
      on: "giveaway",
      admin: {
        description:
          "The prizes selected for this giveaway. A prize's tier comes from the Master Prize Catalogue, so to give a tier prizes, add a catalogue prize that belongs to that tier.",
        defaultColumns: ["prize", "tier", "maxUnits", "unitsAwarded"],
      },
    },
    {
      name: "winners",
      type: "join",
      collection: "giveaway-winners",
      on: "giveaway",
      admin: {
        description:
          "Who won, once the draw has run. Open a winner to see their claim and fulfilment status.",
        defaultColumns: [
          "user",
          "tier",
          "prizeName",
          "claimStatus",
          "fulfilmentStatus",
        ],
      },
    },
    {
      name: "poolNotice",
      type: "ui",
      label: "Prize Pool",
      admin: {
        components: {
          Field:
            "@news-spend-media/payload/components/GiveawayPoolNotice#GiveawayPoolNotice",
        },
      },
    },
    {
      name: "runDraw",
      type: "ui",
      label: "Draw",
      admin: {
        components: {
          Field:
            "@news-spend-media/payload/components/RunGiveawayDraw#RunGiveawayDraw",
        },
      },
    },
    {
      name: "manualWinners",
      type: "ui",
      label: "Manual winners",
      admin: {
        components: {
          Field:
            "@news-spend-media/payload/components/ManualWinners#ManualWinners",
        },
      },
    },
    {
      name: "resendWinnerReport",
      type: "ui",
      label: "Winner Report",
      admin: {
        components: {
          Field:
            "@news-spend-media/payload/components/ResendWinnerReport#ResendWinnerReport",
        },
      },
    },
    {
      name: "winnerReportSentAt",
      type: "date",
      admin: {
        readOnly: true,
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
      },
    },
  ],
};

/**
 * Percentage field shared by all three tiers: accepts decimals to at least two
 * places, rejects negatives and values above 100, and allows 0 to disable the
 * tier (spec 3).
 */
function winnerPercentageField(
  name: string,
  label: string,
  defaultValue: number
) {
  return {
    name,
    label,
    type: "number" as const,
    required: true,
    min: 0,
    max: 100,
    defaultValue,
    admin: {
      step: 0.01,
      description:
        "The most winners this tier may have, as a share of participants, rounded down. Not a promise of winners. 0 disables the tier. Maximum 100.",
    },
    validate: (value: number | null | undefined) => {
      if (value === null || value === undefined) {
        return "A winner percentage is required for every tier.";
      }
      if (Number.isNaN(value)) {
        return "Must be a number.";
      }
      if (value < 0) {
        return "Cannot be negative.";
      }
      if (value > 100) {
        return "Cannot exceed 100%.";
      }
      return true;
    },
  };
}

export default Giveaways;
