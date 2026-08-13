import type { CollectionConfig } from "payload";

import { PRIZE_TIER_OPTIONS } from "./constants";

/**
 * Winner records (spec §12, §13, §21).
 *
 * A winner is a user who was randomly selected from a candidate pool AND
 * successfully allocated a prize. A user may hold at most one winner record per
 * giveaway.
 */
export const GiveawayWinners: CollectionConfig = {
  slug: "giveaway-winners",
  admin: {
    group: "Giveaway",
    useAsTitle: "id",
    defaultColumns: [
      "giveaway",
      "user",
      "tier",
      "prizeName",
      "claimStatus",
      "fulfilmentStatus",
      "selectedAt",
    ],
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: "giveaway",
      type: "relationship",
      relationTo: "giveaways",
      required: true,
      index: true,
    },
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
    },
    {
      name: "tier",
      type: "select",
      required: true,
      index: true,
      options: [...PRIZE_TIER_OPTIONS],
    },
    {
      name: "prize",
      type: "relationship",
      relationTo: "prize-catalogue",
      required: true,
      index: true,
      admin: {
        description: "Reference to the Master Prize Catalogue entry.",
      },
    },
    {
      name: "prizeName",
      type: "text",
      required: true,
      admin: {
        readOnly: true,
        description:
          "Prize name captured at allocation time, so reports stay accurate if the catalogue is later renamed.",
      },
    },
    {
      name: "winningTicket",
      type: "relationship",
      relationTo: "giveaway-tickets",
      required: true,
      index: true,
      admin: {
        description: "The specific ticket entry drawn for this winner.",
      },
    },
    {
      name: "validTicketCount",
      type: "number",
      required: true,
      admin: {
        readOnly: true,
        description: "Total valid tickets this user held when the draw began.",
      },
    },
    {
      name: "boostCount",
      type: "number",
      required: true,
      defaultValue: 0,
      admin: {
        readOnly: true,
        description:
          "Successful Boost Your Luck interactions during the giveaway.",
      },
    },
    {
      name: "featuredOfferCount",
      type: "number",
      required: true,
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: "selectedAt",
      type: "date",
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "claimStatus",
      type: "select",
      required: true,
      defaultValue: "unclaimed",
      index: true,
      options: [
        { label: "Unclaimed", value: "unclaimed" },
        { label: "Claimed", value: "claimed" },
        { label: "Expired", value: "expired" },
        { label: "Forfeited", value: "forfeited" },
      ],
    },
    {
      name: "claimedAt",
      type: "date",
      admin: {
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "claimDeadline",
      type: "date",
      admin: {
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "fulfilmentStatus",
      type: "select",
      required: true,
      defaultValue: "pending",
      index: true,
      options: [
        { label: "Pending", value: "pending" },
        { label: "In Progress", value: "in_progress" },
        { label: "Fulfilled", value: "fulfilled" },
        { label: "Cancelled", value: "cancelled" },
      ],
    },
    {
      name: "fulfilledAt",
      type: "date",
      admin: {
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
      },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation }) => {
        const next = { ...data };
        if (
          operation === "update" &&
          data?.claimStatus === "claimed" &&
          originalDoc?.claimStatus !== "claimed" &&
          !data?.claimedAt
        ) {
          next.claimedAt = new Date().toISOString();
        }
        if (
          operation === "update" &&
          data?.fulfilmentStatus === "fulfilled" &&
          originalDoc?.fulfilmentStatus !== "fulfilled" &&
          !data?.fulfilledAt
        ) {
          next.fulfilledAt = new Date().toISOString();
        }
        return next;
      },
    ],
  },
};

export default GiveawayWinners;
