import type { CollectionConfig } from "payload";

export const Account: CollectionConfig = {
  slug: "accounts",
  access: {
    read: () => true,
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
    },
    {
      name: "idToken",
      type: "text",
      admin: {
        description:
          "OIDC ID token. Mapped to the id_token column, which BetterAuth also uses. Managed by BetterAuth; added in better-auth 1.7.",
      },
    },
    {
      name: "accessToken",
      type: "text",
    },
    {
      name: "refreshToken",
      type: "text",
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
