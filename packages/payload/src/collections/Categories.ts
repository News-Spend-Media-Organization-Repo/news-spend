import type { CollectionConfig } from "payload";
import { slugField } from "payload";

const Categories: CollectionConfig = {
  slug: "categories",
  admin: {
    useAsTitle: "title",
    hidden: true,
  },
  access: {
    read: () => true,
  },

  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    slugField({
      position: "sidebar",
    }),
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
    },
  ],
};

export default Categories;
