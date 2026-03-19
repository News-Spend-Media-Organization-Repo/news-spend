import { env } from "@news-spend-media/env/payload";
import { AdminAccess } from "@news-spend-media/payload/access/AdminAccess";
import { EveryoneAccess } from "@news-spend-media/payload/access/EveryoneAccess";
import { TwitterBlock } from "@news-spend-media/payload/blocks/TwitterPost";
import { hideFromIndexingField } from "@news-spend-media/payload/fields/hideFromIndexing";
import { publishedDateField } from "@news-spend-media/payload/fields/publishedDate";
import { slugField } from "@news-spend-media/payload/fields/slug";
import { titleField } from "@news-spend-media/payload/fields/title";
import { PopulatePublishDateHook } from "@news-spend-media/payload/hooks/PopulatePublishDateHook";
import { RevalidatePageHook } from "@news-spend-media/payload/hooks/RevalidatePageHook";
import { BlocksFeature, lexicalEditor } from "@payloadcms/richtext-lexical";
import type { CollectionConfig } from "payload";

export const Articles: CollectionConfig<"articles"> = {
  access: {
    create: AdminAccess,
    delete: AdminAccess,
    read: EveryoneAccess,
    update: AdminAccess,
  },
  admin: {
    defaultColumns: ["title", "slug", "status", "updatedAt", "publishedDate"],
    group: "Content",
    livePreview: {
      url: ({ data }) => {
        if ("slug" in data && typeof data.slug === "string") {
          return `${env.NEXT_PUBLIC_PAYLOAD_URL}/articles/${data.slug}?isLivePreview=true`;
        }

        return "";
      },
    },
    pagination: {
      defaultLimit: 25,
    },
    useAsTitle: "title",
  },
  fields: [
    {
      tabs: [
        {
          fields: [...titleField()],
          label: "Content",
        },
        {
          fields: [...slugField()],
          label: "Path Setup",
        },
      ],
      type: "tabs",
    },
    {
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({
            blocks: [TwitterBlock],
          }),
        ],
      }),
      name: "body",
      type: "richText",
    },
    ...publishedDateField(),
    ...hideFromIndexingField(),
  ],
  hooks: {
    afterChange: [RevalidatePageHook],
    beforeChange: [PopulatePublishDateHook],
  },
  slug: "articles",
  versions: {
    drafts: {
      autosave: {
        interval: 300,
      },
    },
  },
};
