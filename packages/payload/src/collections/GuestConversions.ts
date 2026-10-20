import type { CollectionConfig } from "payload";

import { isStaff } from "../access/adminRoles";

/**
 * Guest accounts that became registered users.
 *
 * Better Auth deletes the guest user as soon as it links the account, so this
 * is the only lasting record that the conversion happened. Ids are plain text
 * with no foreign keys because either side may later delete their account.
 *
 * Written by the auth hook, never over REST, and readable by staff only.
 */
const GuestConversions: CollectionConfig = {
  slug: "guest-conversions",
  access: {
    read: isStaff,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: "userId",
    group: "Analytics",
    defaultColumns: [
      "anonymousUserId",
      "userId",
      "guestCreatedAt",
      "convertedAt",
    ],
    description:
      "Guest accounts that later signed up or signed in. One row per guest and user pair.",
  },
  indexes: [
    { fields: ["anonymousUserId", "userId"], unique: true },
    { fields: ["convertedAt"] },
  ],
  fields: [
    {
      name: "anonymousUserId",
      type: "text",
      required: true,
      index: true,
      admin: {
        description: "The guest user Better Auth deleted when it linked",
      },
    },
    {
      name: "userId",
      type: "text",
      required: true,
      index: true,
      admin: {
        description: "The registered user the guest became",
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
      name: "convertedAt",
      type: "date",
      required: true,
      admin: {
        description: "When the account was linked",
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

export default GuestConversions;
