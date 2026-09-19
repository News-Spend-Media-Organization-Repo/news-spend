import type { CollectionConfig } from "payload";
import { isStaff } from "../access/adminRoles";

const NewsAnalytics: CollectionConfig = {
  slug: "news-analytics",
  access: {
    // Whole-catalogue engagement data: internal staff only, never a partner.
    read: isStaff,
    // Events arrive through the API server's bulk INSERT, which bypasses
    // Payload, so nothing needs to be creatable over REST. It used to be open
    // to anyone, which let a caller write arbitrary events.
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: "event",
    group: "Analytics",
    defaultColumns: ["article", "event", "platform", "timestamp"],
  },
  fields: [
    {
      name: "article",
      type: "relationship",
      relationTo: "news",
      required: true,
      index: true,
    },
    {
      name: "event",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "Impression", value: "impression" },
        { label: "View", value: "view" },
        { label: "Read", value: "read" },
        { label: "Like", value: "like" },
        { label: "Dislike", value: "dislike" },
        { label: "Share", value: "share" },
        { label: "Comment", value: "comment" },
      ],
    },
    {
      name: "userId",
      type: "text",
      index: true,
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
      name: "metadata",
      type: "json",
      admin: {
        description:
          "Event-specific data: position, screen, timeSpent, scrollDepth, shareMethod",
      },
    },
    {
      name: "timestamp",
      type: "date",
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
    },
  ],
};

export default NewsAnalytics;
