import { addWeeks, startOfWeek } from "date-fns";
import { type CollectionConfig, ValidationError } from "payload";

const Lotteries: CollectionConfig = {
  slug: "lottery",
  admin: {
    useAsTitle: "name",
    group: "Lottery",
  },
  access: {
    read: () => true,
  },
  // only allow one lottery to be active at a time
  hooks: {
    beforeValidate: [
      async ({ req, data }) => {
        if (data?.isActive) {
          const activeLottery = await req.payload.find({
            collection: "lottery",
            where: {
              isActive: {
                equals: true,
              },
            },
            limit: 1,
          });
          if (activeLottery.docs.length > 0) {
            throw new ValidationError({
              collection: "lottery",
              errors: [
                {
                  path: "isActive",
                  message: "Only one lottery can be active at a time",
                },
              ],
              id: activeLottery.docs[0]?.id,
            });
          }
        }
      },
    ],
  },
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
      name: "processing",
      type: "checkbox",
      defaultValue: false,
      admin: {
        readOnly: true,
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
