import crypto from "node:crypto";

import { createORPCErrorConstructorMap } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import type { BasePayload } from "payload";

import { commonErrors } from "../../errors";
import { protectedProcedure, publicProcedure } from "../../index";
import { readSurveySettings } from "./offers/settings";
import {
  awardProviderPoints,
  PointsRefusedError,
  reverseProviderPoints,
} from "./providerPoints";
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

// `processCPXPostback` runs outside a procedure handler context, so it cannot
// use the `errors` factory oRPC injects there. Build the same factories from
// the shared error map so thrown errors stay defined/inferable on the wire.
const errors = createORPCErrorConstructorMap(commonErrors);

const sameHash = (received: string, expected: string): boolean =>
  received.length === expected.length &&
  crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));

/**
 * Runs a points change and turns its failures into answers CPX understands. A
 * refused amount is permanent, so the request still succeeds and CPX stops
 * retrying; anything that stopped the points being saved fails the request, so
 * CPX sends it again.
 */
async function settle<T>(change: () => Promise<T>): Promise<T | undefined> {
  try {
    return await change();
  } catch (error) {
    if (error instanceof PointsRefusedError) {
      console.error(error.message);
      return;
    }
    console.error("Could not save CPX points:", error);
    throw errors.INTERNAL_SERVER_ERROR({
      message: "Could not save the points",
    });
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

  if (!sameHash(secure_hash, expectedHash)) {
    console.error("Invalid secure hash in CPX postback");
    throw errors.BAD_REQUEST({
      message: "Invalid secure hash",
    });
  }

  const user = await payload.findByID({
    collection: "users",
    id: user_id,
    disableErrors: true,
  });

  if (!user) {
    console.error(`User not found: ${user_id}`);
    throw errors.NOT_FOUND({
      message: "User not found",
    });
  }

  const settings = await readSurveySettings(payload);
  const limits = {
    maxPoints: settings.maxPointsPerAward,
    dailyCap: settings.dailyPointsCap,
  };

  if (type === "reversal") {
    const requested = Math.floor(amount_local || 0);

    if (requested <= 0) {
      console.warn(
        `Zero or negative reversal amount (${amount_local}), skipping`
      );
      return { success: true, message: "No points to reverse" };
    }

    const outcome = await settle(() =>
      reverseProviderPoints(payload, {
        provider: "cpx",
        transactionId: `${trans_id}:complete`,
        requested,
        description: "Survey point reversal",
        title: "Survey Points Reversed",
        body: (points) =>
          `${points} points have been reversed from your account due to a survey validation issue.`,
      })
    );

    return {
      success: true,
      message:
        outcome === "reversed"
          ? "Reversal processed successfully"
          : "Nothing to reverse",
    };
  }

  const points = Math.floor(amount_local || 0);
  // A zero bonus or an empty completion pays nothing.
  if (status === "1" && (type === "complete" || type === "out") && points > 0) {
    await settle(() =>
      awardProviderPoints(
        payload,
        {
          provider: "cpx",
          transactionId: `${trans_id}:${type}`,
          userId: user_id,
          points,
          description:
            type === "complete" ? "Completed a survey" : "Survey bonus",
          title: type === "complete" ? "Completed survey" : "Survey Bonus",
          body:
            type === "complete"
              ? `You got ${points} points for completing the survey!`
              : `You received ${points} bonus points for participating in a survey!`,
        },
        limits
      )
    );
  }

  return {
    success: true,
    message: "Survey processed successfully",
  };
}

export const cpxRouter = {
  getSurveys: protectedProcedure.handler(
    async ({ context, errors }): Promise<CPXSurvey[]> => {
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
          throw errors.INTERNAL_SERVER_ERROR({
            message: "Failed to fetch surveys from CPX",
          });
        }

        const parsedData = await cpxResponse.json();

        const validatedData = CPXSurveyResponseSchema.parse(parsedData);

        return validatedData?.surveys || [];
      } catch (error) {
        console.error("Error fetching CPX surveys:", error);
        throw errors.INTERNAL_SERVER_ERROR({
          message: "Failed to fetch surveys",
        });
      }
    }
  ),

  postback: publicProcedure
    .meta(
      openapi({
        method: "GET",
        path: "/survey/cpx/postback",
        tags: ["survey", "cpx"],
        summary: "CPX Research postback endpoint (GET)",
        description:
          "Receives survey conversion notifications from CPX Research.",
      })
    )
    .input(CPXPostBackInputSchema)
    .handler(({ input, context }) => {
      // Not the signature: anyone who reads the logs could replay it.
      const { secure_hash: _signature, ...loggable } = input;
      console.log("Received CPX postback (GET):", loggable);

      return processCPXPostback({
        ...input,
        payload: context.payload,
      });
    }),
};
