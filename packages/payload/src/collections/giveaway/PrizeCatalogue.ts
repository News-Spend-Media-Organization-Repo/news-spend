import { type CollectionConfig, ValidationError } from "payload";

import { PRIZE_TIER_OPTIONS } from "./constants";

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
