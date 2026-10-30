import type { CollectionConfig } from "payload";
import { isStaff } from "../access/adminRoles";

export const NotificationSettings: CollectionConfig = {
  slug: "notification-settings",
  // Payload's default is any signed-in admin; say so, and keep partners out.
  access: {
    read: isStaff,
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
    {
      name: "notificationType",
      type: "select",
      required: true,
      options: [
        { label: "Breaking News", value: "BREAKING_NEWS" },
        { label: "News", value: "NEWS" },
        { label: "Comment", value: "COMMENT" },
        { label: "Earning Opportunity", value: "EARNING_OPPORTUNITY" },
        { label: "Misc", value: "MISC" },
      ],
    },
    {
      name: "isNotificationEnabled",
      type: "checkbox",
      defaultValue: false,
    },
  ],
  admin: {
    useAsTitle: "notificationType",
  },
};
