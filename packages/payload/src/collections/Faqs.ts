import type { CollectionConfig } from "payload";

import { isStaff } from "../access/adminRoles";

/** One question and its answer on the in-app FAQ screen. */
export const Faqs: CollectionConfig = {
  slug: "faqs",
  labels: { singular: "FAQ", plural: "FAQs" },
  admin: {
    useAsTitle: "question",
    group: "Help",
    defaultColumns: ["question", "category", "_status"],
  },
  versions: { drafts: true },
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  fields: [
    { name: "question", type: "text", required: true },
    { name: "answer", type: "textarea", required: true },
    {
      name: "category",
      type: "relationship",
      relationTo: "faq-categories",
      required: true,
      index: true,
    },
  ],
};
