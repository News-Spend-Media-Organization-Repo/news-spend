import { ORPCError } from "@orpc/client";
import { getTweet } from "react-tweet/api";
import { z } from "zod";

import { publicProcedure } from "..";

const getTweetById = publicProcedure
  .input(z.object({ id: z.string() }))
  .route({
    method: "GET",
    path: "/tweet/{id}",
    tags: ["Tweet"],
    summary: "Get tweet by ID",
    description: "Fetch a tweet by its ID from Twitter",
  })
  .handler(async ({ input }) => {
    try {
      const tweet = await getTweet(input.id);

      return { data: tweet };
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      throw new ORPCError("BAD_REQUEST", {
        message:
          error instanceof Error ? error.message : "Failed to fetch tweet",
      });
    }
  });

export const tweetRouter = {
  getById: getTweetById,
};
