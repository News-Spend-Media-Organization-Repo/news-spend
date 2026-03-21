import { BlocksFeature, lexicalEditor } from "@payloadcms/richtext-lexical";
import * as Sentry from "@sentry/nextjs";
import { type CollectionConfig, slugField } from "payload";

import { authenticated } from "../access/authenticated";
import { authenticatedOrPublished } from "../access/authenticatedOrPublished";
import { AdsBlock, ReadAlsoBlock } from "../blocks";
import { calculateNewsMetrics, sendNotificationOnCreate } from "../hooks";
import type { Admin } from "../payload-types";

const News: CollectionConfig = {
  slug: "news",
  access: {
    read: authenticatedOrPublished,
    create: authenticated,
  },
  admin: {
    useAsTitle: "title",
  },
  hooks: {
    // beforeOperation: [
    //   ({ args, operation }) => {
    //     if (operation === 'update' || operation === 'create') {
    //       args.depth = 2
    //     }
    //     return args
    //   },
    // ],
    beforeChange: [calculateNewsMetrics],
    afterRead: [
      async ({ doc, req }) => {
        if (!doc?.id) {
          return doc;
        }
        try {
          const comments = req.payload.count({
            collection: "comments",
            where: {
              news: {
                equals: doc?.id,
              },
            },
            req,
          });

          const result = await Promise.all([comments]);
          return {
            ...doc,
            totalComments: result[0]?.totalDocs ?? 0,
          };
        } catch (error) {
          console.log(`🚀 ~ file: News.ts:329 ~ error: ${error}`);
          return doc;
        }
      },
    ],
    afterChange: [sendNotificationOnCreate],
  },
  versions: {
    drafts: true,
  },
  fields: [
    {
      name: "type",
      label: "News Type",
      type: "select",
      options: [
        { label: "Article", value: "article" },
        { label: "Video", value: "video" },
      ],
      defaultValue: "article",
      admin: {
        description: "💡 Article or Video",
      },
    },
    {
      name: "isLive",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "💡 Check if video is live",
        condition: (data) => data.type === "video",
      },
      hooks: {
        afterChange: [
          ({ value, previousValue, req }) => {
            if (value !== previousValue) {
              // Send a POST request to the publisher API when isLive changes
              fetch(`${process.env.API_URL}/api/publisher/sendMessage`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  channel: "live-news",
                  message: "live news update",
                }),
              })
                .then((response) => {
                  if (!response.ok) {
                    throw new Error("Failed to send message");
                  }
                  return response.json();
                })
                .then((data) => {
                  console.log("Message sent to publisher:", data);
                })
                .catch((error) => {
                  console.error("Error sending message to publisher:", error);
                  if (process.env.NODE_ENV === "production") {
                    Sentry.captureException(error);
                  }
                });
            }
          },
        ],
      },
    },
    {
      name: "title",
      type: "text",
      required: true,
      admin: {
        description: "💡 Title of the news article",
      },
    },
    slugField({
      position: "sidebar",
    }),
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      required: true,
      displayPreview: true,
    },
    {
      name: "keyPoints",
      type: "array",
      fields: [
        {
          name: "point",
          type: "text",
        },
      ],
      admin: {
        condition: (data, siblingData, { user }) => data.type === "article",
      },
      validate: (val) => {
        // if (!val || (val && (val?.length < 1 || val?.length > 3))) {
        //   return 'Articles must have between 1 and 3 key points'
        // }
        return true;
      },
    },
    {
      name: "content",
      type: "richText",
      editor: lexicalEditor({
        features({ defaultFeatures }) {
          return [
            ...defaultFeatures,
            BlocksFeature({
              blocks: [
                AdsBlock,
                ReadAlsoBlock,
                "twitterEmbed",
                "youtubeEmbed",
                "instagramEmbed",
              ],
            }),
          ];
        },
      }),
      admin: {
        condition: (data) => data.type === "article",
      },
    },
    {
      name: "url",
      label: "Video URL",
      type: "text",
      validate: (val: any, { siblingData }: any) => {
        if (siblingData.type !== "video") {
          return true;
        }
        try {
          new URL(val);
          return true;
        } catch (error) {
          return "Please enter a valid URL";
        }
      },
      admin: {
        description: "💡 https://www.youtube.com/embed/video-id",
        condition: (data) => data.type === "video",
      },
    },
    {
      name: "wordCount",
      type: "number",
      defaultValue: 0,
      admin: {
        readOnly: process.env.NODE_ENV !== "development",
        condition: (data) => data.type === "article",
      },
    },
    {
      name: "readTimeMinutes",
      type: "number",
      defaultValue: 0,
      admin: {
        readOnly: process.env.NODE_ENV !== "development",
        condition: (data) => data.type === "article",
      },
    },
    {
      name: "views",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "💡 Number of views",
        readOnly: process.env.NODE_ENV !== "development",
      },
    },
    {
      name: "excerpt",
      type: "text",
      admin: {
        description: "💡 Summary of the article",
      },
      maxLength: 100,
    },
    {
      name: "publishedAt",
      type: "date",
      required: true,
      defaultValue: () => new Date(),
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        position: "sidebar",
      },
    },
    {
      name: "updatedAt",
      type: "date",
      defaultValue: () => new Date(),
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        position: "sidebar",
      },
    },
    {
      name: "points",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "💡 Amount of points to be awarded for this news",
      },
    },
    // TODO: only the admin name and email
    {
      name: "author",
      type: "relationship",
      relationTo: "admins",
      hasMany: false,
      required: true,
      defaultValue: ({ user }: { user: Admin }) => user.id,
      admin: {
        position: "sidebar",
        allowCreate: false,
      },
    },
    {
      name: "category",
      type: "relationship",
      relationTo: "categories",
      required: true,
      admin: {
        position: "sidebar",
        allowCreate: false,
      },
    },
    {
      name: "hasBeenPublished",
      type: "checkbox",
      defaultValue: false,
      admin: {
        // readOnly: true,
        hidden: process.env.NODE_ENV !== "development",
      },
    },
    // virtual fields
    {
      name: "totalComments",
      type: "number",
      virtual: true,
      admin: {
        readOnly: true,
        hidden: process.env.NODE_ENV !== "development",
      },
      defaultValue: 0,
      access: {
        create: () => false,
        update: () => false,
      },
    },
    {
      name: "totalCommentLikes",
      type: "number",
      defaultValue: 0,
      virtual: true,
      admin: {
        readOnly: true,
        hidden: process.env.NODE_ENV !== "development",
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
  ],
};

export default News;
