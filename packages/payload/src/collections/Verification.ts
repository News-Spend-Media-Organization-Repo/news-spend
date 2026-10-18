import type { CollectionConfig } from "payload";
import { isStaff } from "../access/adminRoles";

/**
 * Credentials and one-time codes BetterAuth stores here. Nobody needs to read
 * them through Payload, staff included: BetterAuth talks to the database
 * directly, and a session token or OTP shown in the admin panel is a login.
 */
const hiddenSecret = () => false;

export const Verification: CollectionConfig = {
  slug: "verifications",
  access: {
    read: isStaff,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: {
    group: "Authentication",
  },
  fields: [
    {
      name: "identifier",
      type: "text",
    },
    {
      name: "value",
      type: "text",
      access: { read: hiddenSecret },
    },
    {
      name: "expiresAt",
      type: "date",
    },
  ],
};
