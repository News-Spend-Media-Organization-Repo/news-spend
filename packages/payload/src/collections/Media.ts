import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

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

const execAsync = promisify(child_process.exec);

const REGEX_FILENAME = /^(?<name>.+?)(?<ext>\.[^.]*?)?$/;

const TMP_DIR = "/tmp/payload-video-thumbs";

async function generateVideoThumbnail(inputPath: string, outputPath: string): Promise<void> {
  await execAsync(
    `ffmpeg -ss 00:00:02 -i "${inputPath}" -vframes 1 -c:v mjpeg -q:v 2 "${outputPath}" -y`,
  );
}

export const Media: CollectionConfig = {
  slug: "media",
  access: {
    read: () => true,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (!data.filename) {
          return data;
        }
        console.log("🚀 ~ file: Media.ts:12 ~ data:", data);
        const match = data.filename.match(REGEX_FILENAME);
        const { name = data.filename, ext = "" } = match?.groups || {};
        data.filename = `${slugify(name, { lower: true, strict: true })}${ext}`;
        return data;
      },
    ],
    afterChange: [
      async ({ doc, req, operation }) => {
        if (operation !== "create" || !req.file || !doc.mimeType?.startsWith("video/")) {
          return doc;
        }

        console.log("🎬 [video-thumbnail] Starting for:", doc.filename);

        fs.mkdirSync(TMP_DIR, { recursive: true });

        const inputExt = req.file.name.split(".").pop() || "mp4";
        const inputPath = path.join(TMP_DIR, `${crypto.randomUUID()}.${inputExt}`);
        const outputPath = path.join(TMP_DIR, `${crypto.randomUUID()}.jpg`);

        try {
          if (
            "tempFilePath" in req.file &&
            typeof req.file.tempFilePath === "string" &&
            req.file.tempFilePath.length > 0
          ) {
            fs.copyFileSync(req.file.tempFilePath, inputPath);
          } else {
            fs.writeFileSync(inputPath, req.file.data as Buffer);
          }

          await generateVideoThumbnail(inputPath, outputPath);

          const fileData = fs.readFileSync(outputPath);
          const filesize = fs.statSync(outputPath).size;
          const thumbName = `${crypto.randomUUID()}.jpg`;

          console.log("🎬 [video-thumbnail] Extracted:", filesize, "bytes");

          const thumbDoc = await req.payload.create({
            collection: "media",
            data: {
              filename: thumbName,
              mimeType: "image/jpeg",
              filesize,
              alt: "__video-thumb-temp__",
            },
            file: {
              data: fileData,
              name: thumbName,
              mimetype: "image/jpeg",
              size: filesize,
            },
          });

          await req.payload.update({
            collection: "media",
            id: doc.id,
            data: {
              sizes: thumbDoc.sizes,
            },
          });

          await req.payload.jobs.queue({
            task: "deleteVideoThumbTemp",
            input: { mediaId: String(thumbDoc.id) },
          });

          console.log("🎬 [video-thumbnail] Done for:", doc.filename);
        } catch (err) {
          console.error("🎬 [video-thumbnail] Failed:", err);
        } finally {
          try {
            fs.unlinkSync(inputPath);
          } catch {
            /* ignore */
          }
          try {
            fs.unlinkSync(outputPath);
          } catch {
            /* ignore */
          }
        }

        return doc;
      },
    ],
  },
  upload: {
    displayPreview: true,
    adminThumbnail: ({ doc }) => {
      const sizes = doc?.sizes as Record<string, { url?: string } | undefined>;
      return (
        sizes?.["videoThumbnail"]?.url ??
        sizes?.["thumbnail"]?.url ??
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
        position: "centre",
        formatOptions: {
          format: "webp",
          options: { quality: 85 },
        },
      },
      {
        name: "videoThumbnail",
        width: 400,
        height: 225,
        position: "centre",
        formatOptions: {
          format: "webp",
          options: { quality: 75 },
        },
      },
    ],

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
