import type { CollectionConfig } from "payload";
import { isStaff } from "../access/adminRoles";

/**
 * Credentials and one-time codes BetterAuth stores here. Nobody needs to read
 * them through Payload, staff included: BetterAuth talks to the database
 * directly, and a session token or OTP shown in the admin panel is a login.
 */
const hiddenSecret = () => false;

export const Account: CollectionConfig = {
  slug: "accounts",
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
      name: "userId",
      type: "text",
      required: true,
    },
    {
      name: "accountId",
      type: "text",
      required: true,
    },
    {
      name: "providerId",
      type: "text",
      required: true,
    },
    {
      name: "password",
      type: "text",
      access: { read: hiddenSecret },
    },
    {
      name: "idToken",
      type: "text",
      access: { read: hiddenSecret },
      admin: {
        description:
          "OIDC ID token. Mapped to the id_token column, which BetterAuth also uses. Managed by BetterAuth; added in better-auth 1.7.",
      },
    },
    {
      name: "accessToken",
      type: "text",
      access: { read: hiddenSecret },
    },
    {
      name: "refreshToken",
      type: "text",
      access: { read: hiddenSecret },
    },
    {
      name: "accessTokenExpiresAt",
      type: "date",
    },
    {
      name: "refreshTokenExpiresAt",
      type: "date",
    },
    {
      name: "scope",
      type: "text",
    },
    {
      name: "expiresAt",
      type: "text",
    },
  ],
};
