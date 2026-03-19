import type { CollectionConfig } from "payload";

export const LotteryTickets: CollectionConfig = {
  slug: "lottery-tickets",
  access: {
    read: () => true,
  },
  admin: {
    group: "Lottery",
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
    {
      name: "lottery",
      type: "relationship",
      relationTo: "lottery",
      required: true,
    },
    {
      name: "count",
      type: "number",
      required: true,
    },
    {
      name: "boostLuck",
      type: "number",
      defaultValue: 0,
      required: true,
    },
  ],
};
