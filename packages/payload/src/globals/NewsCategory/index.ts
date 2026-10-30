import type { GlobalConfig } from "payload";
import { isStaff } from "../../access/adminRoles";

const NewsCategory: GlobalConfig = {
  slug: "news-category",
  // Served to the app through the API server (local API); not over REST.
  access: { read: isStaff },
  fields: [
    {
      name: "items",
      type: "array",
      fields: [
        {
          name: "category",
          type: "relationship",
          relationTo: "categories",
          required: false,
          unique: true,
        },
      ],
    },
  ],
};

export default NewsCategory;
