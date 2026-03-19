import type { CollectionConfig } from "payload";

const Reactions: CollectionConfig = {
  slug: "reactions",
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        try {
          const { payload } = req;
          const newsID = doc.news?.id || doc.news;
          if (!newsID) {
            return;
          }

          const likesCount = await payload.count({
            collection: "reactions",
            where: { news: { equals: newsID }, type: { equals: "like" } },
            req,
          });

          const dislikesCount = await payload.count({
            collection: "reactions",
            where: { news: { equals: newsID }, type: { equals: "dislike" } },
            req,
          });

          await payload.update({
            collection: "news",
            id: newsID,
            data: {
              likesCount: likesCount.totalDocs,
              dislikesCount: dislikesCount.totalDocs,
            },
            req,
          });
          return doc;
        } catch (error) {
          console.log("🚀 ~ file: NewsReactions.ts:34 ~ error:", error);
        }
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        // TODO: bulk delete not working accurately
        try {
          const { payload } = req;
          // Recalculate counts after a reaction is deleted
          const newsID = doc.news.id || doc.news;

          const likesCount = await payload.count({
            collection: "reactions",
            where: { news: { equals: newsID }, type: { equals: "like" } },
            req,
          });
          const dislikesCount = await payload.count({
            collection: "reactions",
            where: { news: { equals: newsID }, type: { equals: "dislike" } },
            req,
          });

          await payload.update({
            collection: "news",
            id: newsID,
            data: {
              likesCount: likesCount.totalDocs,
              dislikesCount: dislikesCount.totalDocs,
            },
            req,
          });

          return doc;
        } catch (error) {
          console.log("🚀 ~ file: NewsReactions.ts:60 ~ error:", error);
          throw error;
        }
      },
    ],
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
    },
    {
      name: "news",
      type: "relationship",
      relationTo: "news",
      required: true,
      index: true,
    },
    {
      name: "type",
      type: "select",
      options: ["like", "dislike", "none"],
      required: true,
    },
  ],
};

export default Reactions;
