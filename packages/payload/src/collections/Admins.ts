import type { CollectionConfig } from "payload";

const Admins: CollectionConfig = {
  slug: "admins",
  auth: true,
  access: {
    read: () => true,
    create: () => true,
    update: ({ req: { user } }) => user?.collection === "admins",
    delete: ({ req: { user } }) => user?.collection === "admins",
  },
  admin: {
    useAsTitle: "fullName",
    group: "User Management",
  },
  fields: [
    // uuidField(),
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "viewer",
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
          "Which moderation email this admin receives. Leave unset to follow the role: Super Admins and Content Managers get everything, other roles get nothing. Partners never receive moderation email. Extra non-admin addresses can be added via the MODERATION_ALERT_EMAILS env var.",
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
    },
  ],
};

export default Admins;
