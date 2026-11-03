import type { CollectionConfig } from "payload";
import { isStaff, isSuperAdmin } from "../access/adminRoles";

export const PartnerContentEvents: CollectionConfig = {
  slug: "partner-content-events",
  access: {
    // Whole-catalogue engagement data: internal staff only.
    read: isStaff,
    // Events arrive through the API server's bulk INSERT, which bypasses
    // Payload, so nothing is creatable or editable over REST.
    create: () => false,
    update: () => false,
    // Only super admins can purge events; read-only staff roles cannot.
    delete: isSuperAdmin,
  },
  admin: {
    useAsTitle: "event",
    group: "Analytics",
    defaultColumns: ["content", "partner", "event", "surface", "timestamp"],
  },
  indexes: [
    // What makes a retried batch count once. Per device rather than global, so
    // one device cannot suppress another's event by reusing its id.
    { fields: ["deviceId", "eventId"], unique: true },
    { fields: ["partner", "timestamp"] },
    { fields: ["content", "timestamp"] },
  ],
  fields: [
    {
      name: "content",
      type: "relationship",
      relationTo: "partner-content",
      required: true,
      index: true,
    },
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      required: true,
      index: true,
      admin: {
        description: "Set by the server from the content item, never the app.",
      },
    },
    {
      name: "event",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "Impression", value: "impression" },
        { label: "Click", value: "click" },
        { label: "Video start", value: "video_start" },
        { label: "Video 25%", value: "video_25" },
        { label: "Video 50%", value: "video_50" },
        { label: "Video 75%", value: "video_75" },
        { label: "Video complete", value: "video_complete" },
      ],
    },
    {
      name: "surface",
      type: "text",
      required: true,
      admin: {
        description:
          "The partner-content placement the item was requested with.",
      },
    },
    {
      name: "position",
      type: "number",
      admin: { description: "Position of the item in the list, if known." },
    },
    {
      name: "userId",
      type: "text",
      index: true,
      admin: { description: "From the session only. Empty for guests." },
    },
    {
      name: "sessionId",
      type: "text",
      required: true,
    },
    {
      name: "deviceId",
      type: "text",
      required: true,
    },
    {
      name: "platform",
      type: "select",
      options: [
        { label: "Android", value: "android" },
        { label: "iOS", value: "ios" },
        { label: "Web", value: "web" },
      ],
    },
    {
      name: "timestamp",
      type: "date",
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
      admin: {
        description:
          "When the reader did it, as the device reported, held to within 14 days before and 5 minutes after arrival.",
      },
    },
    {
      name: "receivedAt",
      type: "date",
      admin: {
        readOnly: true,
        description: "When the server received it.",
      },
    },
    {
      name: "eventId",
      type: "text",
      admin: {
        readOnly: true,
        description:
          "Minted by the app for this event and reused on every retry.",
      },
    },
    {
      name: "dedupeKey",
      type: "text",
      unique: true,
      admin: {
        readOnly: true,
        description:
          "One per device, session, event, item and surface. Empty on clicks.",
      },
    },
  ],
};
