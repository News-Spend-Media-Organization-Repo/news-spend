import type { CollectionConfig } from "payload";
import { slugField } from "payload";
import { isStaff } from "../access/adminRoles";
import { IMAGE_ONLY } from "../fields/uploadMimeFilters";
import { guardReferencedDelete } from "../hooks/guardReferencedDelete";

const Categories: CollectionConfig = {
  slug: "categories",
  admin: {
    useAsTitle: "title",
    hidden: true,
  },
  access: {
    // Served to the app through the API server (local API); not over REST.
    read: isStaff,
  },
  hooks: {
    // Deleting a category nulls every article that used it, and the article
    // form requires one, so those articles have to be moved first.
    beforeDelete: [guardReferencedDelete("categories")],
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
      filterOptions: IMAGE_ONLY,
    },
  ],
};

export default Categories;
