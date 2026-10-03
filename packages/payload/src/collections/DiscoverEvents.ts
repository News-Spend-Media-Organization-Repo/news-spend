import type { CollectionConfig } from "payload";
import { isStaff } from "../access/adminRoles";

/**
 * What people do on the Discover tab: opening it, switching sections, opening
 * an app, game, book or survey, and starting a game.
 *
 * Exists to answer one question the rest of the analytics cannot: is the
 * Discover tab used at all. News events are about articles, and nothing else
 * recorded a visit to this tab.
 */
const DiscoverEvents: CollectionConfig = {
  slug: "discover-events",
  access: {
    // Usage of the whole app: internal staff only, never a partner.
    read: isStaff,
    // Events arrive through the API server's bulk INSERT, which bypasses
    // Payload, so nothing needs to be creatable over REST.
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: "event",
    group: "Analytics",
    defaultColumns: ["event", "section", "itemType", "itemId", "timestamp"],
  },
  fields: [
    {
      name: "event",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "Opened Discover", value: "view" },
        { label: "Viewed a section", value: "section" },
        { label: "Opened an item", value: "open" },
        { label: "Started a game", value: "game_launch" },
        { label: "Game blocked", value: "game_blocked" },
        { label: "Game reported", value: "game_report" },
      ],
    },
    {
      name: "section",
      type: "text",
      index: true,
      admin: {
        description: "all, apps, games, books or surveys.",
      },
    },
    {
      name: "itemType",
      type: "text",
      index: true,
      admin: {
        description:
          "For an opened item: game, app, book, survey, giveaway or brands.",
      },
    },
    {
      name: "itemId",
      type: "text",
      admin: {
        description: "The item's id; for a game, its slug.",
      },
    },
    {
      name: "source",
      type: "text",
      admin: {
        description:
          "Where it came from: a list, a universal link, or the All tab.",
      },
    },
    { name: "userId", type: "text", index: true },
    { name: "sessionId", type: "text", required: true },
    { name: "deviceId", type: "text", required: true },
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
          "The device and event id together, which is what makes a retried batch count once. A single column, not a compound index: Payload names compound indexes after their fields, and news-analytics already has one named the same.",
      },
    },
    {
      name: "timestamp",
      type: "date",
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
      admin: {
        description:
          "When it happened, as the device reported, held to within 14 days before and 5 minutes after arrival.",
      },
    },
    {
      name: "receivedAt",
      type: "date",
      admin: { readOnly: true },
    },
  ],
};

export default DiscoverEvents;
