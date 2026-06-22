import { sql } from "@payloadcms/db-postgres";
import type { CollectionConfig } from "payload";

const Comments: CollectionConfig = {
  slug: "comments",
  admin: {
    useAsTitle: "text",
  },
  access: {
    read: () => true,
    create: () => true,
    // TODO: Public users should not be able to update published comments
    // Users should only be allowed to update their own draft comments
    // Admins should have full control
  },
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== "create") {
          return;
        }

        if (doc?.parent) {
          const parentId = typeof doc.parent === "string" ? doc.parent : doc.parent.id;
          try {
            req.payload.logger.info(
              { parentId, op: "increment" },
              "Comments.afterChange: incrementing parent totalReplies",
            );
            await req.payload.db.drizzle.execute(
              sql`UPDATE comments
                  SET total_replies = GREATEST(COALESCE(total_replies, 0) + 1, 0)
                  WHERE id = ${parentId}`,
            );
            req.payload.logger.info(
              { parentId },
              "Comments.afterChange: parent totalReplies incremented",
            );
          } catch (err) {
            req.payload.logger.error(
              { err, parentId, op: "increment" },
              "Comments.afterChange: parent totalReplies increment failed",
            );
          }
        }

        if (doc?.news) {
          const newsId = typeof doc.news === "string" ? doc.news : doc.news.id;
          try {
            req.payload.logger.info(
              { newsId, op: "increment" },
              "Comments.afterChange: incrementing news totalComments",
            );
            await req.payload.db.drizzle.execute(
              sql`UPDATE "news"
                  SET "total_comments" = GREATEST(COALESCE("total_comments", 0) + 1, 0)
                  WHERE id = ${newsId}`,
            );
            req.payload.logger.info(
              { newsId },
              "Comments.afterChange: news totalComments incremented",
            );
          } catch (err) {
            req.payload.logger.error(
              { err, newsId, op: "increment" },
              "Comments.afterChange: news totalComments increment failed",
            );
          }
        }
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        // Descendants are cascade-deleted by the comments.parent_id FK
        // (see migration 20260622_120000), so we only update the parent's
        // totalReplies and the news article's totalComments.

        if (doc?.parent) {
          const parentId = typeof doc.parent === "string" ? doc.parent : doc.parent.id;
          try {
            req.payload.logger.info(
              { parentId, op: "decrement" },
              "Comments.afterDelete: decrementing parent totalReplies",
            );
            await req.payload.db.drizzle.execute(
              sql`UPDATE comments
                  SET total_replies = GREATEST(COALESCE(total_replies, 0) - 1, 0)
                  WHERE id = ${parentId}`,
            );
            req.payload.logger.info(
              { parentId },
              "Comments.afterDelete: parent totalReplies decremented",
            );
          } catch (err) {
            req.payload.logger.error(
              { err, parentId, op: "decrement" },
              "Comments.afterDelete: parent totalReplies decrement failed",
            );
          }
        }

        if (doc?.news) {
          const newsId = typeof doc.news === "string" ? doc.news : doc.news.id;
          try {
            req.payload.logger.info(
              { newsId, op: "decrement" },
              "Comments.afterDelete: decrementing news totalComments",
            );
            await req.payload.db.drizzle.execute(
              sql`UPDATE "news"
                  SET "total_comments" = GREATEST(COALESCE("total_comments", 0) - 1, 0)
                  WHERE id = ${newsId}`,
            );
            req.payload.logger.info(
              { newsId },
              "Comments.afterDelete: news totalComments decremented",
            );
          } catch (err) {
            req.payload.logger.error(
              { err, newsId, op: "decrement" },
              "Comments.afterDelete: news totalComments decrement failed",
            );
          }
        }
      },
    ],
  },
  fields: [
    {
      name: "text",
      type: "text",
      required: true,
    },
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      hasMany: false,
    },
    {
      name: "news",
      type: "relationship",
      relationTo: "news",
      required: true,
      hasMany: false,
    },
    {
      name: "parent",
      type: "relationship",
      relationTo: "comments",
      hasMany: false,
    },
    {
      name: "replyingTo",
      type: "relationship",
      relationTo: "comments",
      hasMany: false,
    },
    {
      name: "likes",
      type: "relationship",
      relationTo: "users",
      hasMany: true,
      admin: {
        hidden: true,
        description:
          "Legacy field. Kept during the polymorphic-target migration. Will be removed after the data migration confirms all reactions are in the `reactions` collection.",
      },
    },
    {
      name: "dislikes",
      type: "relationship",
      relationTo: "users",
      hasMany: true,
      admin: {
        hidden: true,
        description:
          "Legacy field. Kept during the polymorphic-target migration. Will be removed after the data migration confirms all reactions are in the `reactions` collection.",
      },
    },
    {
      name: "likesCount",
      type: "number",
      defaultValue: 0,
      admin: {
        readOnly: true,
        hidden: process.env.NODE_ENV !== "development",
      },
    },
    {
      name: "dislikesCount",
      type: "number",
      defaultValue: 0,
      admin: {
        readOnly: true,
        hidden: process.env.NODE_ENV !== "development",
      },
    },
    // virtual field for replies
    {
      name: "replies",
      type: "relationship",
      relationTo: "comments",
      hasMany: true,
      maxDepth: 0,
      admin: {
        readOnly: true,
      },
      virtual: true,
      hooks: {
        // afterRead: [getReplies],
      },
    },
    {
      name: "totalReplies",
      type: "number",
      admin: {
        readOnly: true,
      },
      defaultValue: 0,
    },
  ],
};

export default Comments;
