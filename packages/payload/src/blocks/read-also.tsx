import type { Block } from "payload";

export const ReadAlsoBlock: Block = {
  slug: "readAlso",
  labels: {
    singular: "Read Also",
    plural: "Read Also",
  },
  interfaceName: "ReadAlsoBlock",
  admin: {
    components: {
      Block:
        "@news-spend-media/payload/blocks/ReadAlso/Component#ReadAlsoBlockComponent",
    },
  },
  fields: [
    {
      name: "news",
      type: "relationship",
      relationTo: "news",
      hasMany: false,
      filterOptions: {
        _status: { equals: "published" },
      },
      admin: {
        description: "💡This will be inserted in between the news content",
        allowCreate: false,
      },
      required: true,
    },
  ],
};
