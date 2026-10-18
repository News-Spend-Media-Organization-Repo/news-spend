import type { CollectionConfig } from "payload";
import { isStaff } from "../access/adminRoles";

/**
 * Credentials and one-time codes BetterAuth stores here. Nobody needs to read
 * them through Payload, staff included: BetterAuth talks to the database
 * directly, and a session token or OTP shown in the admin panel is a login.
 */
const hiddenSecret = () => false;

export const Session: CollectionConfig = {
  slug: "sessions",
  access: {
    read: isStaff,
    create: () => process.env.NODE_ENV === "development",
  },
  admin: {
    group: "Authentication",
  },
  fields: [
    {
      name: "userId",
      type: "text",
    },
    {
      name: "expiresAt",
      type: "date",
    },
    {
      name: "ipAddress",
      type: "text",
    },
    {
      name: "token",
      type: "text",
      access: { read: hiddenSecret },
    },
    {
      name: "userAgent",
      type: "text",
    },
  ],
};
