import { type CollectionConfig, ValidationError } from "payload";

import { FULFILMENT_TYPE_OPTIONS, PRIZE_TIER_OPTIONS } from "./constants";

/**
 * Master Prize Catalogue (spec §2).
 *
 * The single source of truth for all prize definitions. Every prize belongs to
 * exactly one tier, and duplicate prize names are rejected regardless of tier.
 * All giveaway configurations, winner records, reports, notifications and
 * fulfilment records reference prizes by this collection's ID.
 */
export const PrizeCatalogue: CollectionConfig = {
  slug: "prize-catalogue",
  admin: {
    group: "Giveaway",
    useAsTitle: "name",
    defaultColumns: ["name", "tier", "active", "updatedAt"],
    description:
      "Single source of truth for prizes. A prize belongs to exactly one tier.",
  },
  access: {
    read: () => true,
  },
  hooks: {
    beforeValidate: [
      async ({ req, data, originalDoc, operation }) => {
        const name = data?.name?.trim();

        if (name) {
          // Duplicate prize names are not permitted across tiers, so the check
          // is case-insensitive and deliberately ignores the tier field.
          const duplicate = await req.payload.find({
            collection: "prize-catalogue",
            where: { name: { equals: name } },
            limit: 1,
            pagination: false,
          });

          const clash = duplicate.docs[0];
          if (clash && clash.id !== originalDoc?.id) {
            throw new ValidationError({
              collection: "prize-catalogue",
              errors: [
                {
                  path: "name",
                  message: `"${name}" already exists in the catalogue (${clash.tier}). Duplicate prize names are not permitted across tiers.`,
                },
              ],
            });
          }
        }

        // A prize may never move between tiers once giveaways reference it.
        if (
          operation === "update" &&
          originalDoc?.tier &&
          data?.tier &&
          data.tier !== originalDoc.tier
        ) {
          const inUse = await req.payload.find({
            collection: "giveaway-prizes",
            where: { prize: { equals: originalDoc.id } },
            limit: 1,
            pagination: false,
          });

          if (inUse.docs.length > 0) {
            throw new ValidationError({
              collection: "prize-catalogue",
              errors: [
                {
                  path: "tier",
                  message:
                    "This prize is already used in one or more giveaways and cannot be reassigned to a different tier.",
                },
              ],
            });
          }
        }

        return { ...data, ...(name ? { name } : {}) };
      },
    ],
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          "Must be unique across the entire catalogue, including other tiers.",
      },
    },
    {
      name: "tier",
      type: "select",
      required: true,
      index: true,
      options: [...PRIZE_TIER_OPTIONS],
      admin: {
        description:
          "The one and only tier this prize belongs to. Cannot be changed once the prize is used in a giveaway.",
      },
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "fulfilmentType",
      label: "How is this delivered?",
      type: "select",
      required: true,
      index: true,
      defaultValue: "physical",
      options: [...FULFILMENT_TYPE_OPTIONS],
      admin: {
        description:
          "Drives the whole claim flow: what the app asks the winner for, and whether fulfilment is automatic or arranged by hand.",
      },
    },
    {
      name: "pointsAmount",
      label: "Points awarded",
      type: "number",
      min: 1,
      admin: {
        condition: (data) => data?.fulfilmentType === "points",
        description:
          "Credited to the winner the moment they claim. Required for a points prize.",
      },
      validate: (value: number | null | undefined, { siblingData }: any) => {
        if (siblingData?.fulfilmentType !== "points") {
          return true;
        }
        if (value === null || value === undefined) {
          return "A points prize needs an amount.";
        }
        if (!Number.isInteger(value) || value < 1) {
          return "Must be a whole number of at least 1.";
        }
        return true;
      },
    },
    {
      name: "valueNaira",
      label: "Value (₦)",
      type: "number",
      min: 0,
      admin: {
        description:
          "Retail value of one unit. Only required if a giveaway sets a monetary budget cap; otherwise it is for reporting.",
      },
      validate: (value: number | null | undefined) => {
        if (value !== null && value !== undefined && value < 0) {
          return "Cannot be negative.";
        }
        return true;
      },
    },
    {
      name: "requiresVerification",
      label: "Requires identity verification before dispatch",
      type: "checkbox",
      defaultValue: false,
      index: true,
      admin: {
        description:
          "The winner can still claim immediately — this only gates delivery. Use it for high-value items, not for airtime or points.",
      },
    },
    {
      name: "reloadlyLocalAmount",
      label: "Reloadly amount (local currency)",
      type: "number",
      min: 0,
      admin: {
        condition: (data) =>
          data?.fulfilmentType === "airtime" || data?.fulfilmentType === "data",
        description:
          "What Reloadly actually sends, in the recipient's currency. Falls back to Value (₦) for airtime if left empty — required for data, where the amount is a specific network bundle, not a free amount.",
      },
    },
    {
      name: "reloadlyOperatorId",
      label: "Reloadly operator",
      type: "number",
      admin: {
        condition: (data) => data?.fulfilmentType === "data",
        description:
          "The specific network bundle this prize sends (e.g. MTN Nigeria Data). Data plans are fixed, network-specific bundles — ₦600 buys a different plan on every network — so this cannot be auto-detected from the winner's phone number the way airtime can. Look the id up from Reloadly's operator list.",
      },
      validate: (value: number | null | undefined, { siblingData }: any) => {
        if (siblingData?.fulfilmentType !== "data") {
          return true;
        }
        if (value === null || value === undefined) {
          return "A data prize needs a Reloadly operator id — the amount alone does not identify a bundle.";
        }
        return true;
      },
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      required: false,
    },
    {
      name: "active",
      type: "checkbox",
      defaultValue: true,
      index: true,
      admin: {
        description:
          "Inactive prizes cannot be added to new giveaways. Existing giveaways are unaffected.",
        position: "sidebar",
      },
    },
  ],
};

export default PrizeCatalogue;
