import type { CollectionConfig } from "payload";

import { isStaff } from "../access/adminRoles";

/**
 * One row per provider per survey offers request: how many offers that
 * provider returned, for which country. This is the only signal that shows
 * whether a provider improves availability.
 *
 * Append-only and written through the Local API; staff may read it.
 */
export const SurveyOfferEvents: CollectionConfig = {
  slug: "survey-offer-events",
  labels: { singular: "Survey Offer Event", plural: "Survey Offer Events" },
  admin: {
    group: "Surveys",
    useAsTitle: "provider",
    defaultColumns: ["provider", "country", "offerCount", "createdAt"],
    description:
      "Provider offer counts per request. Used to measure survey fill; not a payments record.",
  },
  access: {
    read: isStaff,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: "provider",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "CPX Research", value: "cpx" },
        { label: "RapidoReach", value: "rapido" },
        { label: "TheoremReach", value: "theorem" },
        { label: "BitLabs", value: "bitlabs" },
      ],
    },
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
    },
    {
      name: "country",
      type: "text",
      index: true,
    },
    {
      name: "offerCount",
      type: "number",
      required: true,
    },
  ],
};
