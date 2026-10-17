import type { CollectionBeforeDeleteHook, CollectionConfig } from "payload";
import { APIError } from "payload";

import { isStaff } from "../access/adminRoles";
import { FAQ_ICONS } from "../lib/faqSeed";

/**
 * A category with questions in it cannot be deleted: the questions would be
 * left pointing at nothing and drop out of the app. Drafts count too: a
 * question that was never published still has a row in the main `faqs`
 * table (with `_status: "draft"`), which is what `count` reads. `count` has
 * no `draft` option to pass.
 */
export const preventDeleteWithQuestions: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  const { totalDocs } = await req.payload.count({
    collection: "faqs",
    where: { category: { equals: id } },
    // Same transaction as the delete, so a migration that removes the
    // questions and then the category sees its own writes.
    req,
  });
  if (totalDocs > 0) {
    throw new APIError(
      `Move or delete its ${totalDocs} ${totalDocs === 1 ? "question" : "questions"} first.`,
      400
    );
  }
};

/** Groups on the in-app FAQ screen. Order is set by dragging in the admin. */
export const FaqCategories: CollectionConfig = {
  slug: "faq-categories",
  labels: { singular: "FAQ Category", plural: "FAQ Categories" },
  admin: {
    useAsTitle: "name",
    group: "Help",
    defaultColumns: ["name", "icon"],
  },
  orderable: true,
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    beforeDelete: [preventDeleteWithQuestions],
  },
  fields: [
    { name: "name", type: "text", required: true },
    {
      name: "icon",
      type: "select",
      required: true,
      defaultValue: "help-circle",
      options: [...FAQ_ICONS],
    },
    {
      name: "questions",
      type: "join",
      collection: "faqs",
      on: "category",
      orderable: true,
    },
  ],
};
