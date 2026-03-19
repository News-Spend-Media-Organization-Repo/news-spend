import { sql } from "@payloadcms/db-postgres";
import type { CollectionConfig } from "payload";

import { authenticated } from "../access/authenticated";

export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
    group: "User Management",
  },
  hooks: {
    afterChange: [],
    beforeDelete: [
      async ({ id, req }) => {
        const logger = req.payload.logger;
        try {
          await Promise.all([
            req.payload.db.drizzle.execute(
              sql`DELETE FROM push_tokens WHERE user_id = ${id}`
            ),
            req.payload.db.drizzle.execute(
              sql`DELETE FROM activities WHERE user_id = ${id}`
            ),
          ]);
        } catch (err) {
          logger.error(
            { err, userId: id },
            "Error during user pre-delete cleanup"
          );
        }
      },
    ],
  },
  access: {
    // read: ({ req, id }) => {
    //   if (!req.user) return false
    //   return req.user.id === id || req.user.collection === 'admins'
    // },
    // update: ({ req, id }) => {
    //   if (!req.user) return false
    //   return req.user.id === id || req.user.collection === 'admins'
    // },
    // delete: ({ req, id }) => {
    //   if (!req.user) return false
    //   return req.user.id === id || req.user.collection === 'admins'
    // },
    read: authenticated,
    create: () => false,
    update: () => false,
    delete: () => false,
  },

  fields: [
    {
      name: "userId",
      type: "text",
      // unique: true,
      // maxLength: 10,
    },
    {
      name: "email",
      type: "text",
    },
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      type: "text",
      name: "image",
    },
    {
      name: "username",
      type: "text",
      unique: true,
      required: true,
    },
    {
      name: "wish",
      type: "text",
      required: true,
    },
    {
      name: "phone",
      type: "text",
      required: true,
    },
    {
      name: "_verified",
      type: "checkbox",
      required: true,
    },
    {
      name: "isAnonymous",
      type: "checkbox",
    },
    {
      name: "dailyRead",
      type: "json",
      required: true,
      jsonSchema: {
        uri: "a://b/foo2.json",
        fileMatch: ["a://b/foo2.json"], // required
        schema: {
          title: "Daily Read",
          type: "object",
          properties: {
            count: {
              type: "integer",
              minimum: 0,
              maximum: 5,
              default: 0,
            },
            updatedAt: {
              type: "string",
            },
          },
        },
      },
      defaultValue: {
        count: 0,
        updatedAt: "2025-02-19T18:06:57.781Z",
      },
    },
    {
      name: "notificationPreferences",
      type: "json",
      index: true,
      jsonSchema: {
        uri: "a://b/foo.json", // required
        fileMatch: ["a://b/foo.json"], // required
        schema: {
          type: "object",
          properties: {
            types: {
              type: "object",
              properties: {
                BREAKING_NEWS: {
                  type: "boolean",
                },
                NEWS: {
                  type: "boolean",
                },
                COMMENT: {
                  type: "boolean",
                },
                EARNING_OPPORTUNITY: {
                  type: "boolean",
                },
                MISC: {
                  type: "boolean",
                },
              },
            },
          },
        },
      },
      defaultValue: {
        // TODO: changes 'types' to 'categories' or 'preferences'
        types: {
          BREAKING_NEWS: true,
          NEWS: true,
          COMMENT: false,
          EARNING_OPPORTUNITY: false,
          MISC: false,
        },
      },
    },
    {
      name: "lastActive",
      type: "date",
      admin: {
        description: "Last time the user was active in the app",
      },
    },
    {
      name: "customAttributes",
      type: "json",
      admin: {
        description: "Custom user attributes for advanced segmentation",
      },
    },
  ],
};
