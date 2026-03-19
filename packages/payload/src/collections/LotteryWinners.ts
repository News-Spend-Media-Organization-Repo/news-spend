import type { CollectionConfig } from "payload";

const LotteryWinners: CollectionConfig = {
  slug: "lottery-winners",
  admin: {
    group: "Lottery",
  },
  fields: [
    {
      name: "lottery",
      type: "relationship",
      relationTo: "lottery",
      required: true,
    },
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
    {
      name: "prizeTier",
      type: "select",
      required: true,
      options: [
        { label: "High", value: "HIGH" },
        { label: "Mid", value: "MID" },
        { label: "Low", value: "LOW" },
        { label: "None", value: "NONE" },
      ],
    },
    {
      name: "prize",
      type: "text",
      required: false,
    },
    {
      name: "claimed",
      type: "checkbox",
      defaultValue: false,
    },
    {
      name: "claimedAt",
      type: "date",
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
      },
    },
  ],
};

export default LotteryWinners;
