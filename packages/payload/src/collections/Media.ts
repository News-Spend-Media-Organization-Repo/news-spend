import {
  BoldFeature,
  FixedToolbarFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  lexicalEditor,
  ParagraphFeature,
  UnderlineFeature,
} from "@payloadcms/richtext-lexical";
import type { CollectionConfig } from "payload";
import slugify from "slugify";

const REGEX_FILENAME = /^(?<name>.+?)(?<ext>\.[^.]*?)?$/;

export const Media: CollectionConfig = {
  slug: "media",
  access: {
    read: () => true,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        console.log("🚀 ~ file: Media.ts:12 ~ data:", data);
        const match = data.filename.match(REGEX_FILENAME);
        const { name = data.filename, ext = "" } = match?.groups || {};
        data.filename = `${slugify(name, { lower: true, strict: true })}${ext}`;
        return data;
      },
    ],
  },
  upload: {
    displayPreview: true,
    adminThumbnail: ({ doc }) => {
      return (
        // @ts-expect-error
        doc?.sizes?.thumbnail?.url ??
        `https://media.newsspend.com/assets${process.env.NODE_ENV === "production" ? "" : "/dev"}/media/${doc.filename}`
      );
    },
    mimeTypes: ["image/*", "video/*"],

    imageSizes: [
      {
        name: "thumbnail",
        width: 400,
        height: 400,
        position: "centre",
        formatOptions: {
          format: "webp",
          options: { quality: 75 },
        },
      },
      {
        name: "card",
        width: 768,
        height: 1024,
        position: "centre",
        formatOptions: {
          format: "webp",
          options: { quality: 80 },
        },
      },
      {
        name: "mobile",
        width: 800,
        // No height - maintains aspect ratio
        position: "centre",
        formatOptions: {
          format: "webp",
          options: { quality: 85 },
        },
      },
    ],

    // Convert original uploads to WebP
    formatOptions: {
      format: "webp",
      options: { quality: 85 },
    },
  },
  fields: [
    {
      name: "alt",
      type: "text",
    },
    {
      name: "caption",
      type: "richText",
      editor: lexicalEditor({
        features: () => [
          ParagraphFeature(),
          UnderlineFeature(),
          BoldFeature(),
          ItalicFeature(),
          LinkFeature(),
          FixedToolbarFeature(),
          InlineToolbarFeature(),
        ],
      }),
    },
  ],
};
