import type { Media } from "@news-spend-media/payload/types";
import { ORPCError } from "@orpc/client";
import z from "zod";
import { zfd } from "zod-form-data";

import { rateLimitedPublicProcedure } from "../index";

const ReportInput = zfd.formData({
  name: zfd.text(),
  title: zfd.text(),
  reportType: zfd.text(z.enum(["shortMessage", "video", "picture"])),
  description: zfd.text(),
  files: zfd.repeatableOfType(zfd.file()),
});

export type ReportInputType = z.infer<typeof ReportInput>;

const create = rateLimitedPublicProcedure
  .route({
    method: "POST",
    path: "/report/create",
  })
  .input(ReportInput)
  .handler(async ({ input, context }) => {
    const { payload } = context;
    // upload files
    const { files, ...rest } = input;

    const transactionID = await payload.db.beginTransaction();
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
              // @ts-expect-error
              req: { transactionID },
            });

            return response;
          })
        );
      } catch (error) {
        console.log(error);
        // @ts-expect-error
        await payload.db.rollbackTransaction(transactionID);
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
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
        // @ts-expect-error
        req: { transactionID },
      });

      // @ts-expect-error
      await payload.db.commitTransaction(transactionID);
      return response;
    } catch (error) {
      // @ts-expect-error
      await payload.db.rollbackTransaction(transactionID);
      throw error;
    }
  });

export const reportRouter = {
  create,
};
