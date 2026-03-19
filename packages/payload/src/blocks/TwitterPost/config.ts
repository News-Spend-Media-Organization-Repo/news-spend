import type { Block } from "payload";

export const TwitterBlock: Block = {
  slug: "twitterEmbed",
  imageURL: "https://abs.twimg.com/favicons/favicon.ico",
  interfaceName: "TwitterPostBlock",
  imageAltText: "Twitter",
  labels: {
    singular: "Twitter Post",
    plural: "Twitter Posts",
  },
  admin: {
    components: {
      Block:
        "@local/payload/blocks/TwitterPost/Component#TwitterPostBlockComponent",
    },
  },
  fields: [
    {
      name: "tweetId",
      type: "text",
      required: true,
      label: "Tweet ID or URL",
      admin: {
        description:
          "💡 Enter tweet ID (e.g., 1628832338187636740) or full URL (e.g., https://twitter.com/user/status/1628832338187636740)",
      },
    },
  ],
};
