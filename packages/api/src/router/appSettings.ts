import {
  type AppSettingsDoc,
  resolveShareMessage,
} from "@news-spend-media/payload/lib/appSettings";
import { openapi } from "@orpc/openapi";
import type { BasePayload } from "payload";
import z from "zod";

import { publicProcedure } from "..";

/**
 * The last successfully read message. A failed read must not blank the share
 * screen or flip it to a stale default, so this outlives the request.
 */
let lastGood: string | null = null;

export function resetShareMessageCache(): void {
  lastGood = null;
}

export async function readShareMessage(payload: BasePayload): Promise<string> {
  try {
    const doc = (await payload.findGlobal({
      slug: "app-settings",
      depth: 0,
    })) as AppSettingsDoc;
    lastGood = resolveShareMessage(doc);
    return lastGood;
  } catch (error) {
    console.error(
      "Could not read app settings, using the last known share message:",
      error
    );
    return lastGood ?? resolveShareMessage(null);
  }
}

const getShareMessage = publicProcedure
  .meta(
    openapi({
      method: "GET",
      path: "/app-settings/share-message",
      tags: ["app-settings"],
      summary: "The invitation text shared from the Share App screen",
    })
  )
  .output(z.object({ message: z.string() }))
  .handler(async ({ context }) => ({
    message: await readShareMessage(context.payload),
  }));

export const appSettingsRouter = { getShareMessage };
