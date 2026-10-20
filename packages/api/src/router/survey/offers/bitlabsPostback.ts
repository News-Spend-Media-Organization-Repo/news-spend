import crypto from "node:crypto";

import { openapi } from "@orpc/openapi";
import z from "zod";

import { publicProcedure } from "../../..";
import { signedCallbackUrl } from "../../../lib/callbackUrl";
import {
  awardProviderPoints,
  PointsRefusedError,
  reverseProviderPoints,
} from "../providerPoints";
import { readSurveySettings } from "./settings";

const sameHash = (received: string, expected: string): boolean =>
  received.length === expected.length &&
  crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));

/**
 * BitLabs signs the complete callback URL with a hex HMAC-SHA1 of the app
 * secret, before `&hash=` is appended. Never rebuild this from parsed input.
 */
export function signBitLabsUrl(secretKey: string, url: string): string {
  return crypto.createHmac("sha1", secretKey).update(url).digest("hex");
}

const bitlabsSecret = () => process.env.BITLABS_SECRET;

/**
 * One callback route for every BitLabs state. Configure the dashboard with
 * these parameter names: uid, tx, value, usd, type, ref, survey_id.
 */
export const bitlabsPostbackHandler = publicProcedure
  .meta(
    openapi({
      method: "GET",
      path: "/survey/bitlabs/postback",
      tags: ["survey", "bitlabs"],
      summary: "BitLabs postback endpoint",
      description:
        "Receives survey state callbacks from BitLabs (COMPLETE, SCREENOUT, START_BONUS, RECONCILIATION).",
    })
  )
  .input(
    z
      .object({
        uid: z.string().optional(),
        tx: z.string().optional(),
        value: z.coerce.number().optional(),
        usd: z.coerce.number().optional(),
        type: z.string().optional(),
        ref: z.string().optional(),
        survey_id: z.string().optional(),
        hash: z.string().optional(),
      })
      .passthrough()
  )
  .output(
    z.union([
      z.object({ success: z.boolean() }),
      z.object({ error: z.string() }),
    ])
  )
  .handler(async ({ input, context, errors }) => {
    console.log("Received BitLabs postback:", {
      type: input.type,
      tx: input.tx,
      uid: input.uid,
      value: input.value,
      usd: input.usd,
      ref: input.ref,
      survey_id: input.survey_id,
    });

    const secret = bitlabsSecret();
    if (!secret) {
      throw errors.BAD_REQUEST({ message: "BitLabs not configured" });
    }

    const hash = input.hash;
    if (!hash) {
      console.error("BitLabs postback without a hash, ignoring");
      return { error: "Invalid hash" };
    }

    const request = context.request;
    const requestUrl = request && "url" in request ? request.url : undefined;
    const signed =
      request && typeof requestUrl === "string"
        ? signedCallbackUrl({ url: requestUrl, headers: request.headers })
        : null;
    if (!signed) {
      console.error("BitLabs postback has no request URL to verify");
      return { error: "Invalid hash" };
    }

    if (!sameHash(hash, signBitLabsUrl(secret, signed.url))) {
      console.error("Invalid hash in BitLabs postback", {
        origin: signed.source,
        path: signed.path,
      });
      return { error: "Invalid hash" };
    }

    const { payload } = context;
    const type = (input.type ?? "").toUpperCase();
    const transactionId = input.tx;
    const userId = input.uid;
    const value = Math.floor(Math.abs(input.value ?? 0));

    const fail = (): never => {
      throw errors.INTERNAL_SERVER_ERROR({
        message: "Could not save the points",
      });
    };

    const settle = async (
      label: string,
      change: () => Promise<unknown>
    ): Promise<void> => {
      try {
        await change();
      } catch (error) {
        if (error instanceof PointsRefusedError) {
          // Permanent: answering an error would only make BitLabs retry.
          console.error(error.message);
          return;
        }
        console.error(`Could not save BitLabs points for ${label}:`, error);
        fail();
      }
    };

    if (type === "SCREENOUT") {
      return { success: true };
    }

    if (type === "RECONCILIATION") {
      if (!transactionId) {
        return { error: "Missing required parameters" };
      }
      await settle(transactionId, () =>
        reverseProviderPoints(payload, {
          provider: "bitlabs",
          transactionId,
          requested: value,
          description: `BitLabs reconciliation: ${transactionId}`,
          title: "Survey Points Reversed",
          body: (points) =>
            `${points} points have been reversed from your account due to a survey validation issue.`,
        })
      );
      return { success: true };
    }

    const isCompletion = type === "COMPLETE";
    const isStartBonus = type === "START_BONUS";
    if (!(isCompletion || isStartBonus)) {
      console.log(`BitLabs callback type ${type || "(none)"} ignored`);
      return { success: true };
    }

    if (!(transactionId && userId) || value <= 0) {
      console.error("BitLabs callback missing required parameters:", {
        type,
        hasTx: Boolean(transactionId),
        hasUid: Boolean(userId),
        value,
      });
      return { error: "Missing required parameters" };
    }

    const settings = await readSurveySettings(payload);
    // A start bonus is a separate grant; keeping it off the completion's
    // transaction id lets a reconciliation of the survey leave it alone.
    const awardKey = isStartBonus ? `${transactionId}:start` : transactionId;

    await settle(awardKey, () =>
      awardProviderPoints(
        payload,
        {
          provider: "bitlabs",
          transactionId: awardKey,
          userId,
          points: value,
          description: isStartBonus
            ? `BitLabs start bonus: ${input.survey_id ?? awardKey}`
            : `Completed BitLabs survey: ${input.survey_id ?? awardKey}`,
          title: isStartBonus ? "Survey Bonus" : "Survey Completed",
          body: `You earned ${value} points!`,
        },
        {
          maxPoints: settings.maxPointsPerAward,
          dailyCap: settings.dailyPointsCap,
        }
      )
    );

    return { success: true };
  });
