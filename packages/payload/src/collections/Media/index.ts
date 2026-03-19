import { EveryoneAccess } from "@news-spend-media/payload/access/EveryoneAccess";
import { LoggedInAccess } from "@news-spend-media/payload/access/LoggedInAccess";
import type { CollectionConfig } from "payload";

export const Media: CollectionConfig<"media"> = {
  access: {
    create: LoggedInAccess,
    delete: LoggedInAccess,
    read: EveryoneAccess,
    update: LoggedInAccess,
  },
  admin: {
    group: "Media",
  },
  fields: [
    {
      name: "alt",
      required: true,
      type: "text",
    },
  ],
  slug: "media",
  upload: true,
};
