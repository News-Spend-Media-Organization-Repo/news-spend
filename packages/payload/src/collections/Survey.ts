import type { CollectionConfig } from "payload";
import { isStaff } from "../access/adminRoles";
import { urlField } from "../fields/urlField";
import { MAX_SURVEY_POINTS } from "../lib/surveyPoints";

export const Survey: CollectionConfig = {
  slug: "survey",
  // Payload's default is any signed-in admin; say so, and keep partners out.
  access: {
    read: isStaff,
  },
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
    urlField({
      name: "surveyLink",
      required: true,
    }),
    {
      name: "users",
      type: "relationship",
      relationTo: "users",
      hasMany: true,
    },
    {
      name: "points",
      type: "number",
      min: 0,
      max: MAX_SURVEY_POINTS,
      admin: {
        description: `Points paid for completing this survey, up to ${MAX_SURVEY_POINTS}.`,
      },
    },
  ],
};
