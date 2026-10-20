import type { GlobalConfig } from "payload";

import { isStaff } from "../../access/adminRoles";

/**
 * Survey mediation policy: which providers are live, in what order, for which
 * countries, and the caps on what a completion may pay.
 *
 * Every field has a code-level default in `lib/surveySettings`, so an unsaved
 * global keeps today's providers working and the unverified ones off. Secrets
 * stay in env; nothing here is a credential.
 */
const SurveySettings: GlobalConfig = {
  slug: "survey-settings",
  admin: {
    group: "Surveys",
  },
  access: {
    read: isStaff,
    update: isStaff,
  },
  fields: [
    {
      name: "providers",
      type: "array",
      labels: { singular: "Provider", plural: "Providers" },
      admin: {
        description:
          "One row per provider. A provider with no row uses its built-in default: CPX and Rapido on, Theorem and BitLabs off.",
      },
      fields: [
        {
          name: "provider",
          type: "select",
          required: true,
          options: [
            { label: "CPX Research", value: "cpx" },
            { label: "RapidoReach", value: "rapido" },
            { label: "TheoremReach", value: "theorem" },
            { label: "BitLabs", value: "bitlabs" },
          ],
        },
        {
          name: "enabled",
          type: "checkbox",
          defaultValue: true,
        },
        {
          name: "priority",
          type: "number",
          defaultValue: 0,
          admin: {
            description: "Lower numbers show first.",
          },
        },
        {
          name: "countries",
          type: "text",
          hasMany: true,
          admin: {
            description: "ISO country codes; empty means every country.",
          },
        },
        {
          name: "wallUrl",
          type: "text",
          admin: {
            description:
              "Opened when the merged list is empty. {userId} is replaced with the signed-in user's id.",
          },
        },
      ],
    },
    {
      name: "dailyPointsCap",
      type: "number",
      defaultValue: 20_000,
      min: 0,
      admin: {
        description:
          "Most points one user may earn from surveys in a day. Reversals do not count.",
      },
    },
    {
      name: "maxPointsPerAward",
      type: "number",
      defaultValue: 5000,
      min: 1,
      max: 50_000,
      admin: {
        description:
          "Most points one completed survey may pay. Raise it when a real payout shows the default is too low.",
      },
    },
  ],
};

export default SurveySettings;
