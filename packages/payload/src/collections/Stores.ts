import { type CollectionConfig, slugField } from "payload";

export const Stores: CollectionConfig = {
  slug: "stores",
  access: {
    read: () => true,
  },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "image", "url", "cashBack"],
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    slugField({
      useAsSlug: "name",
      position: "sidebar",
    }),
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      required: true,
    },
    {
      name: "url",
      type: "text",
      admin: {
        description: "💡 Url of the store",
      },
      validate: async (val: any) => {
        try {
          new URL(val);
          return true;
        } catch (error) {
          return "Please enter a valid URL";
        }
      },
      required: true,
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "cashBack",
      type: "number",
      defaultValue: 0,
      admin: {
        description:
          "💡 Cashback is in percentage. For example, if the cashback is 5%, enter 5.",
      },
    },
  ],
};
