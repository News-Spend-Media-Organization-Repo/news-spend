import payload, { type CollectionConfig, type FieldHook } from "payload";

const getReplies: FieldHook = async ({ data }) => {
  const replies = await payload.find({
    collection: "comments",
    overrideAccess: true,
    where: {
      parent: {
        equals: data?.id,
      },
    },
    limit: 3,
  });

  if (replies.docs) {
    return replies.docs.map((doc) => doc.id);
  }

  return null;
};

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
    beforeDelete: [
      async ({ id, req }) => {
        // delete replies if comment is a top-level comment
        await req.payload.delete({
          collection: "comments",
          where: {
            parent: {
              equals: id,
            },
          },
        });
      },
    ],
    afterRead: [
      async ({ doc, req }) => {
        try {
          const replies = await req.payload.count({
            collection: "comments",
            overrideAccess: true,
            where: {
              parent: {
                equals: doc?.id,
              },
            },
          });

          return {
            ...doc,
            totalReplies: replies.totalDocs,
          };
        } catch (error) {
          console.log("🚀 ~ file: Comments.ts:131 ~ error:", error);
          return 0;
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
      virtual: true,
    },
  ],
};

export default Comments;
