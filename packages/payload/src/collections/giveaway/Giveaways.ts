import { addWeeks, startOfWeek } from "date-fns";
import { type CollectionConfig, ValidationError } from "payload";

import {
  DRAW_CHECKPOINT_OPTIONS,
  GIVEAWAY_STATUS_OPTIONS,
  type GiveawayStatus,
  LOCKED_GIVEAWAY_STATUSES,
} from "./constants";

/**
 * Core giveaway configuration (spec §1, §3).
 *
 * The administrator configures exactly four things: ticket price, the maximum
 * winner percentage per tier, the prize pool (see `giveaway-prizes`), and the
 * maximum units per selected prize (also on `giveaway-prizes`). Tier
 * eligibility rules are platform business logic and are not represented here.
 */
export const Giveaways: CollectionConfig = {
  slug: "giveaways",
  admin: {
    group: "Giveaway",
    useAsTitle: "name",
    defaultColumns: [
      "name",
      "status",
      "startDate",
      "endDate",
      "totalValidParticipants",
    ],
  },
  access: {
    read: () => true,
  },
  hooks: {
    beforeValidate: [
      async ({ req, data, originalDoc, operation }) => {
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
            throw new ValidationError({
              collection: "giveaways",
              errors: [
                {
                  path: "status",
                  message: `"${clash.name}" is already active. Only one giveaway may be active at a time.`,
                },
              ],
              id: clash.id,
            });
          }
        }

        // Configuration locks when the draw begins (spec §5, §16).
        if (
          operation === "update" &&
          prevStatus &&
          LOCKED_GIVEAWAY_STATUSES.includes(prevStatus)
        ) {
          const lockedFields = [
            "ticketPrice",
            "tier1WinnerPercentage",
            "tier2WinnerPercentage",
            "tier3WinnerPercentage",
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
    },
    {
      type: "collapsible",
      label: "Winner Distribution",
      admin: {
        description:
          "Maximum percentage of Total Valid Participants that may win in each tier. Enter 0 to disable a tier.",
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
              "Total retail value this draw may award. Leave empty for no monetary cap. Every prize in the pool must have a Value (₦) for this to be usable.",
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
          "Identifies this draw across every attempt at it. A resumption reuses it rather than starting a new one (§19).",
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
          "The last material step the draw completed. A resumption continues from the next one (§19).",
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
 * tier (spec §3).
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
      description: "0 disables this tier. Maximum 100.",
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
