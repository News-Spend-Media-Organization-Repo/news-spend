import type { CollectionConfig } from "payload";
import { isSuperAdmin } from "../access/adminRoles";
import { IMAGE_ONLY } from "../fields/uploadMimeFilters";

const Admins: CollectionConfig = {
  slug: "admins",
  auth: true,
  // Deleting an admin nulls the author on every article they wrote (the FK is
  // ON DELETE SET NULL), so default deletes go to Trash instead.
  trash: true,
  access: {
    // Partners sign in here too, so they may read only their own record.
    read: ({ req: { user } }) => {
      if (user?.collection !== "admins") {
        return false;
      }
      return user.role === "partner" ? { id: { equals: user.id } } : true;
    },
    // Creating an account chooses its role, so it is a super-admin decision.
    // The first-user flow is unaffected: Payload creates that account with
    // access overridden.
    create: isSuperAdmin,
    // Everyone may edit their own profile; only a super-admin edits others.
    update: ({ req: { user } }) => {
      if (user?.collection !== "admins") {
        return false;
      }
      return user.role === "super-admin" ? true : { id: { equals: user.id } };
    },
    delete: isSuperAdmin,
  },
  admin: {
    useAsTitle: "fullName",
    group: "User Management",
  },
  hooks: {
    // Trashing keeps the row, so articles keep their author. Only a permanent
    // delete would null it, which is why it has to be reassigned first.
    beforeDelete: [
      async ({ id, req }) => {
        const { totalDocs } = await req.payload.count({
          collection: "news",
          where: { author: { equals: id } },
          req,
        });

        if (totalDocs > 0) {
          throw new Error(
            `${totalDocs} article(s) still list this account as their author. Reassign them before deleting it permanently.`
          );
        }
      },
    ],
  },
  fields: [
    // uuidField(),
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "viewer",
      // Without this, anyone allowed to edit their own profile could promote
      // themselves to super-admin.
      access: {
        create: isSuperAdmin,
        update: isSuperAdmin,
      },
      options: [
        { label: "Super Admin", value: "super-admin" },
        { label: "Content Manager", value: "content-manager" },
        { label: "Editor", value: "editor" },
        { label: "Viewer", value: "viewer" },
        { label: "Partner", value: "partner" },
      ],
    },
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      hasMany: false,
      // Which partner's numbers this account sees, so a partner must not be
      // able to point their own account at another partner.
      access: {
        create: isSuperAdmin,
        update: isSuperAdmin,
      },
      admin: {
        condition: (data) => data.role === "partner",
      },
    },
    {
      name: "moderationAlerts",
      type: "select",
      options: [
        { label: "All moderation email", value: "all" },
        { label: "Urgent reports only", value: "urgent" },
        { label: "Daily digest only", value: "digest" },
        { label: "None", value: "none" },
      ],
      admin: {
        condition: (data) => data.role !== "partner",
        description:
          "Which moderation email this admin receives. Leave unset to follow the roles configured in Moderation Settings. Partners never receive moderation email. Note that moderation alerts can never be switched off entirely: if every recipient opts out, Super Admins are notified regardless of this setting.",
      },
    },
    {
      name: "fullName",
      type: "text",
      required: true,
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      filterOptions: IMAGE_ONLY,
    },
  ],
};

export default Admins;
