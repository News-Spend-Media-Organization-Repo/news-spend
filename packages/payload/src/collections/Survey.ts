import type { CollectionConfig } from "payload";

import { urlField } from "../fields/urlField";
import { MAX_SURVEY_POINTS } from "../lib/surveyPoints";

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
