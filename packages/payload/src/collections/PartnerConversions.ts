import type { CollectionConfig } from "payload";
import { isStaff, readOwnPartnerOrStaff } from "../access/adminRoles";

export const PartnerConversions: CollectionConfig = {
  slug: "partner-conversions",
  admin: {
    group: "Partners",
    defaultColumns: [
      "user",
      "partner",
      "content",
      "status",
      "clickId",
      "createdAt",
    ],
    useAsTitle: "clickId",
  },
  // Rows carry click ids, partner order ids and the points awarded, so they
  // are not public. The API server writes through the local API, which skips
  // these rules; they govern the REST/GraphQL surface and the admin panel.
  access: {
    read: readOwnPartnerOrStaff("partner"),
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
    },
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      required: true,
      index: true,
    },
    {
      name: "content",
      type: "relationship",
      relationTo: "partner-content",
      required: true,
      index: true,
    },
    {
      name: "clickId",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description: "Unique tracking ID for this click/conversion",
      },
    },
    {
      name: "surface",
      type: "text",
      index: true,
      admin: {
        readOnly: true,
        description: "Where the tap came from; set by the app",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "clicked",
      options: [
        { label: "Clicked", value: "clicked" },
        { label: "Converted", value: "converted" },
        { label: "Points Awarded", value: "awarded" },
        { label: "Failed", value: "failed" },
      ],
      index: true,
    },
    {
      name: "pointsAwarded",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "Points awarded to user upon conversion",
      },
    },
    {
      name: "partnerOrderId",
      type: "text",
      admin: {
        description: "Order/transaction ID from partner",
      },
    },
    {
      name: "metadata",
      type: "json",
      admin: {
        description: "Additional data from partner (IP, device info, etc.)",
      },
    },
    {
      name: "clickedAt",
      type: "date",
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "convertedAt",
      type: "date",
      admin: {
        description: "When partner confirmed conversion",
        position: "sidebar",
      },
    },
    {
      name: "awardedAt",
      type: "date",
      admin: {
        description: "When points were awarded to user",
        position: "sidebar",
      },
    },
  ],
};
