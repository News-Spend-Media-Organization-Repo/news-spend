import { publicProcedure } from "../index";

export const getPromoMedia = publicProcedure
  .route({
    method: "GET",
    path: "/ads/promo-media",
    tags: ["Ads"],
    summary: "Get promo media",
    description: "Get promo media for the current user",
  })
  .handler(async ({ context }) => {
    const { payload } = context;
    const ads = await payload.find({
      collection: "partner-content",
      where: { type: { equals: "promo-media" } },
      pagination: false,
    });

    return ads.docs;
  });

export const adsRouter = {
  getPromoMedia,
};
