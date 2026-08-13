import type { Media } from "@news-spend-media/payload/types";
import { openapi } from "@orpc/openapi";
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
              req: { transactionID },
            });

            return response;
          })
        );
      } catch (error) {
        console.log(error);
        await payload.db.rollbackTransaction(transactionID);
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

      await payload.db.commitTransaction(transactionID);
      return response;
    } catch (error) {
      await payload.db.rollbackTransaction(transactionID);
      throw error;
    }
  });

export const reportRouter = {
  create,
};
