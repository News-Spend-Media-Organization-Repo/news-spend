import type { CollectionConfig } from "payload";

import { isStaff } from "../access/adminRoles";

/**
 * Guest accounts created, and guests that became registered users.
 *
 * Better Auth deletes a guest as soon as it links the account, so this is the
 * only lasting record of either event. Ids are plain text with no foreign keys
 * because either side may later delete their account.
 *
 * Written by the auth hooks, never over REST, and readable by staff only.
 */
const GuestEvents: CollectionConfig = {
  slug: "guest-events",
  access: {
    read: isStaff,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: "anonymousUserId",
    group: "Analytics",
    defaultColumns: [
      "kind",
      "anonymousUserId",
      "userId",
      "guestCreatedAt",
      "occurredAt",
    ],
    description:
      "Guest accounts created and guests that later signed up or signed in. Append-only.",
  },
  indexes: [
    // One `created` row per guest.
    { fields: ["kind", "anonymousUserId"], unique: true },
    // One `converted` row per guest and user pair.
    { fields: ["anonymousUserId", "userId"], unique: true },
  ],
  fields: [
    {
      name: "kind",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "Guest created", value: "created" },
        { label: "Converted", value: "converted" },
      ],
    },
    {
      name: "anonymousUserId",
      type: "text",
      required: true,
      index: true,
      admin: {
        description: "The guest user Better Auth deletes",
      },
    },
    {
      name: "userId",
      type: "text",
      index: true,
      admin: {
        description: "The registered user the guest became; empty for created",
      },
    },
    {
      name: "guestCreatedAt",
      type: "date",
      required: true,
      admin: {
        description: "When the guest account was created",
      },
    },
    {
      name: "occurredAt",
      type: "date",
      required: true,
      admin: {
        description: "When the event happened",
      },
    },
    {
      name: "createdAt",
      type: "date",
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        description: "When this row was written",
      },
    },
  ],
  timestamps: false,
};

export default GuestEvents;
