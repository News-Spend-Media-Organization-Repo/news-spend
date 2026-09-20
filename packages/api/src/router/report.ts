import type { Media } from "@news-spend-media/payload/types";
import { openapi } from "@orpc/openapi";
import z from "zod";

import { rateLimitedPublicProcedure } from "../index";

/**
 * Multipart input, expressed in plain Zod.
 *
 * `zod-form-data` used to do this, but it is built for Zod 3: its helpers
 * wrap everything in a `z.any().refine(...)` preprocess that Zod 4 evaluates
 * during contract introspection, where the value is not a FormData at all. It
 * threw at OpenAPI generation and took the whole server down at startup. Zod 4
 * has `z.file()` natively, so the dependency buys nothing here.
 *
 * The single-or-many handling is kept deliberately: a form with one file
 * attached sends one value rather than a list, and `zfd.repeatableOfType`
 * smoothed that over. Dropping it would break a report with exactly one
 * attachment, the most common kind.
 */
const ReportInput = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  reportType: z.enum(["shortMessage", "video", "picture"]),
  description: z.string().min(1),
  files: z
    .union([z.file(), z.array(z.file())])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .default([]),
});

export type ReportInputType = z.infer<typeof ReportInput>;

const create = rateLimitedPublicProcedure
  .meta(
    openapi({
      method: "POST",
      path: "/report/create",
    })
  )
  .input(ReportInput)
  .handler(async ({ input, context, errors }) => {
    const { payload } = context;
    // upload files
    const { files, ...rest } = input;

    // `beginTransaction` gives null when the adapter cannot open one, and
    // Payload treats a missing id as "no transaction": create then runs on its
    // own and commit or rollback do nothing. Keeping it as undefined says that
    // in the types, and the two helpers below skip the calls it would ignore.
    const transactionID = (await payload.db.beginTransaction()) ?? undefined;
    const commit = async () => {
      if (transactionID !== undefined) {
        await payload.db.commitTransaction(transactionID);
      }
    };
    const rollback = async () => {
      if (transactionID !== undefined) {
        await payload.db.rollbackTransaction(transactionID);
      }
    };
    let filesToUpload: Media[] = [];
    if (files?.length > 0) {
      try {
        filesToUpload = await Promise.all(
          files.map(async (file) => {
            const response = await payload.create({
              collection: "media",
              data: {
                alt: file.name,
                mimeType: file.type,
                filename: file.name,
                filesize: file.size,
              },
              file: {
                data: Buffer.from(await file.arrayBuffer()),
                mimetype: file.type,
                name: file.name,
                size: file.size,
              },
              req: { transactionID },
            });

            return response;
          })
        );
      } catch (error) {
        console.log(error);
        await rollback();
        throw errors.INTERNAL_SERVER_ERROR({
          message: "Failed to upload files",
        });
      }
    }

    try {
      const response = await payload.create({
        collection: "witness-reports",
        data: {
          ...rest,
          files: filesToUpload.map((file) => file.id),
        },
        req: { transactionID },
      });

      await commit();
      return response;
    } catch (error) {
      await rollback();
      throw error;
    }
  });

export const reportRouter = {
  create,
};
