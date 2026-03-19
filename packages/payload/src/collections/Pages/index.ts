import { env } from "@news-spend-media/env/payload";
import { AdminAccess } from "@news-spend-media/payload/access/AdminAccess";
import { EveryoneAccess } from "@news-spend-media/payload/access/EveryoneAccess";
import { hideFromIndexingField } from "@news-spend-media/payload/fields/hideFromIndexing";
import { publishedDateField } from "@news-spend-media/payload/fields/publishedDate";
import { slugField } from "@news-spend-media/payload/fields/slug";
import { titleField } from "@news-spend-media/payload/fields/title";
import { PopulatePublishDateHook } from "@news-spend-media/payload/hooks/PopulatePublishDateHook";
import { RevalidatePageHook } from "@news-spend-media/payload/hooks/RevalidatePageHook";
import {
  createBreadcrumbsField,
  createParentField,
} from "@payloadcms/plugin-nested-docs";
import type { CollectionConfig } from "payload";

export const Pages: CollectionConfig<"pages"> = {
  access: {
    create: AdminAccess,
    delete: AdminAccess,
    read: EveryoneAccess,
    update: AdminAccess,
  },
  admin: {
    defaultColumns: [
      "title",
      "pathname",
      "status",
      "updatedAt",
      "publishedDate",
    ],
    group: "Content",
    livePreview: {
      url: ({ data }) => {
        if ("pathname" in data && typeof data.pathname === "string") {
          return `${env.NEXT_PUBLIC_PAYLOAD_URL}${data.pathname}?isLivePreview=true`;
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
          fields: [
            ...slugField(),
            createParentField("pages"),
            createBreadcrumbsField("pages"),
          ],
          label: "Path Setup",
        },
      ],
      type: "tabs",
    },
    ...publishedDateField(),
    ...hideFromIndexingField(),
  ],
  hooks: {
    afterChange: [RevalidatePageHook],
    beforeChange: [PopulatePublishDateHook],
  },
  slug: "pages",
  versions: {
    drafts: {
      autosave: {
        interval: 300,
      },
    },
  },
};
