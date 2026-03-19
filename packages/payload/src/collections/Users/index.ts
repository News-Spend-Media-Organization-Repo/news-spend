import { AdminAccess } from "@local/payload/access/AdminAccess";
import { LoggedInAccess } from "@local/payload/access/LoggedInAccess";
import type { CollectionConfig } from "payload";

export const Users: CollectionConfig<"users"> = {
  access: {
    create: AdminAccess,
    read: LoggedInAccess,
    update: AdminAccess,
  },
  admin: {
    group: "Site Config",
    useAsTitle: "email",
  },
  auth: true,
  fields: [
    {
      defaultValue: "user",
      name: "role",
      options: ["user", "admin"],
      required: true,
      type: "select",
    },
  ],
  slug: "users",
};
