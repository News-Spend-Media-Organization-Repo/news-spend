import type { Block } from "payload";

export const InstagramBlock: Block = {
  slug: "instagramEmbed",
  interfaceName: "InstagramEmbedBlock",
  imageAltText: "Instagram",
  imageURL: "https://www.instagram.com/favicon.ico",
  labels: {
    singular: "Instagram Post",
    plural: "Instagram Posts",
  },
  admin: {
    components: {
      Block:
        "@local/payload/blocks/Instagram/Component#InstagramBlockComponent",
    },
  },
  fields: [
    {
      name: "postUrl",
      type: "text",
      required: true,
      label: "Instagram URL",
      admin: {
        description:
          "💡 Enter Instagram post URL (e.g., https://www.instagram.com/p/ABC123/ or https://www.instagram.com/reel/DEF456/)",
      },
    },
    {
      name: "caption",
      type: "text",
      label: "Caption",
      admin: {
        description: "Optional caption for the post",
      },
    },
  ],
};
