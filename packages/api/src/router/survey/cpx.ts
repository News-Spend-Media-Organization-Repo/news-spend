import crypto from "node:crypto";

import { sendNotification } from "@news-spend-media/payload/lib/lottery-notification";
import { ORPCError } from "@orpc/client";
import type { BasePayload } from "payload";

import { protectedProcedure, publicProcedure } from "../../index";
import {
  CPX_APP_ID,
  CPXPostBackInputSchema,
  type CPXSurvey,
  CPXSurveyResponseSchema,
} from "./schemas";
import {
  generateCPXSecureHash,
  getMockSurveysForGuests,
  getUserCountryCode,
  getUserIpAddress,
} from "./utils";

async function awardPoints({
  input,
  title,
  body,
  payload,
}: {
  input: { user_id: string; amount_local?: number; trans_id: string };
  title?: string;
  body?: string;
  payload: BasePayload;
}): Promise<void> {
  try {
    await payload.create({
      collection: "activities",
      data: {
        type: "point",
        point: input.amount_local || 0,
        description: "Completed a survey",
        action: "surveyTask",
        user: input.user_id,
        metadata: input,
      },
    });

    const { docs: pushTokens } = await payload.find({
      collection: "push-tokens",
      where: {
        user: {
          in: [input.user_id],
        },
      },
    });

    await sendNotification({
      pushTokens,
      title: title ?? "Survey Completed",
      body: body ?? "You have completed a survey and earned points!",
      data: input,
    });
  } catch (error) {
    console.error("Error awarding points:", error);
  }
}

async function reversePoints({
  input,
  title,
  body,
  payload,
}: {
  input: { user_id: string; amount_local?: number; trans_id: string };
  title?: string;
  body?: string;
  payload: BasePayload;
}): Promise<void> {
  try {
    await payload.create({
      collection: "activities",
      data: {
        type: "point",
        point: -(input.amount_local || 0),
        description: "Survey point reversal",
        action: "pointReversal",
        user: input.user_id,
        metadata: input,
      },
    });

    const { docs: pushTokens } = await payload.find({
      collection: "push-tokens",
      where: {
        user: {
          in: [input.user_id],
        },
      },
    });

    await sendNotification({
      pushTokens,
      title: title ?? "Points Adjustment",
      body:
        body ??
        `${input.amount_local} points have been reversed from your account.`,
      data: input,
    });

    console.log(
      `Reversed ${input.amount_local} points from user ${input.user_id} (Transaction: ${input.trans_id})`
    );
  } catch (error) {
    console.error("Error processing point reversal:", error);
  }
}

export async function processCPXPostback(input: {
  status: string;
  trans_id: string;
  user_id: string;
  amount_local?: number;
  type: string;
  secure_hash: string;
  payload: BasePayload;
}): Promise<{ success: boolean; message: string }> {
  const {
    status,
    trans_id,
    user_id,
    amount_local,
    type,
    secure_hash,
    payload,
  } = input;

  const expectedHash = crypto
    .createHash("md5")
    .update(`${trans_id}-${process.env.CPX_SECURE_HASH}`)
    .digest("hex");

  if (secure_hash !== expectedHash) {
    console.error("Invalid secure hash in CPX postback");
    throw new ORPCError("BAD_REQUEST", {
      message: "Invalid secure hash",
    });
  }

  const user = await payload.findByID({
    collection: "users",
    id: user_id,
  });

  if (!user) {
    console.error(`User not found: ${user_id}`);
    throw new ORPCError("NOT_FOUND", {
      message: "User not found",
    });
  }

  if (type === "reversal") {
    const pointsToReverse = Math.floor(amount_local || 0);

    if (pointsToReverse <= 0) {
      console.warn(
        `Zero or negative reversal amount (${amount_local}), skipping`
      );
      return { success: true, message: "No points to reverse" };
    }

    await reversePoints({
      input: { user_id, amount_local, trans_id },
      title: "Survey Points Reversed",
      body: `${pointsToReverse} points have been reversed from your account due to a survey validation issue.`,
      payload,
    });

    console.log(
      `Reversed ${pointsToReverse} points from user ${user_id} for survey ${trans_id}`
    );

    return {
      success: true,
      message: "Reversal processed successfully",
    };
  }

  if (status === "1" && type === "complete") {
    const pointsAwarded = Math.floor(amount_local || 0);

    await awardPoints({
      input: { user_id, amount_local, trans_id },
      title: "Completed survey",
      body: `You got ${pointsAwarded} points for completing the survey!`,
      payload,
    });

    console.log(
      `Awarded ${pointsAwarded} points to user ${user_id} for survey ${trans_id}`
    );
  }

  if (status === "1" && type === "out") {
    const pointsAwarded = Math.floor(amount_local || 0);

    if (pointsAwarded > 0) {
      await awardPoints({
        input: { user_id, amount_local, trans_id },
        title: "Survey Bonus",
        body: `You received ${pointsAwarded} bonus points for participating in a survey!`,
        payload,
      });
    }

    console.log(
      `Bonus ${pointsAwarded} points to user ${user_id} for survey ${trans_id}`
    );
  }

  return {
    success: true,
    message: "Survey processed successfully",
  };
}

export const cpxRouter = {
  getSurveys: protectedProcedure.handler(
    async ({ context }): Promise<CPXSurvey[]> => {
      const { user, request } = context;

      if (!user) {
        return getMockSurveysForGuests();
      }

      if (!request) {
        return getMockSurveysForGuests();
      }

      try {
        // @ts-expect-error
        const userIp = getUserIpAddress(request);
        const countryCode = await getUserCountryCode(userIp);
        const secureHash = generateCPXSecureHash(user.id);
        const userAgent = request.headers.get("user-agent") || "";

        const baseUrl = "https://live-api.cpx-research.com/api/get-surveys.php";
        const params = new URLSearchParams({
          app_id: CPX_APP_ID || "",
          ext_user_id: user.id,
          output_method: "api",
          ip_user: userIp,
          limit: "6",
          user_country_code: countryCode,
          email: user.email || "",
          username: user.username || "",
          secure_hash: secureHash,
          user_agent: userAgent,
        });
        const url = `${baseUrl}?${params.toString()}`;
        const cpxResponse = await fetch(url);

        if (!cpxResponse.ok) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Failed to fetch surveys from CPX",
          });
        }

        const parsedData = await cpxResponse.json();

        const validatedData = CPXSurveyResponseSchema.parse(parsedData);

        return validatedData?.surveys || [];
      } catch (error) {
        console.error("Error fetching CPX surveys:", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to fetch surveys",
        });
      }
    }
  ),

  postback: publicProcedure
    .route({
      method: "GET",
      path: "/survey/cpx/postback",
      tags: ["survey", "cpx"],
      summary: "CPX Research postback endpoint (GET)",
      description:
        "Receives survey conversion notifications from CPX Research.",
    })
    .input(CPXPostBackInputSchema)
    .handler(({ input, context }) => {
      console.log("Received CPX postback (GET):", input);

      return processCPXPostback({
        ...input,
        payload: context.payload,
      });
    }),
};
