import type { CollectionConfig } from "payload";

export const Survey: CollectionConfig = {
  slug: "survey",
  admin: {
    useAsTitle: "name",
    group: "Points Mall",
  },
  fields: [
    {
      name: "name",
      type: "text",
    },
    {
      name: "googleFormId",
      type: "text",
      required: true,
    },
    {
      name: "surveyLink",
      type: "text",
      required: true,
      validate: (val: any) => {
        try {
          new URL(val);
          return true;
        } catch {
          return "Please enter a valid URL";
        }
      },
    },
    {
      name: "users",
      type: "relationship",
      relationTo: "users",
      hasMany: true,
    },
    {
      name: "points",
      type: "number",
    },
  ],
};
