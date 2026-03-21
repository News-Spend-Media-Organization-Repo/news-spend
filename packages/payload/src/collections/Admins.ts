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
