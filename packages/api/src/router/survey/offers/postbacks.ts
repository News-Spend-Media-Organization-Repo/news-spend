import crypto from "node:crypto";

import { openapi } from "@orpc/openapi";
import z from "zod";

import { publicProcedure } from "../../..";
import {
  awardProviderPoints,
  PointsRefusedError,
  reverseProviderPoints,
} from "../providerPoints";
import { readSurveySettings } from "./settings";

/** A copy of `input` without the named keys, for logging without secrets. */
const without = <T extends Record<string, unknown>>(
  input: T,
  keys: (keyof T)[]
): Partial<T> =>
  Object.fromEntries(
    Object.entries(input).filter(([key]) => !keys.includes(key as keyof T))
  ) as Partial<T>;

/** Equal hashes, compared without leaking how much of them matched. */
const sameHash = (received: string, expected: string): boolean =>
  received.length === expected.length &&
  crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));

function verifyTheoremReachHash(
  secretKey: string,
  url: string,
  receivedHash: string
): boolean {
  const signature = crypto
    .createHmac("sha1", secretKey)
    .update(url)
    .digest("base64");

  const expectedHash = signature
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return sameHash(receivedHash, expectedHash);
}

function verifyRapidoReachHash(
  secretKey: string,
  transactionId: string,
  offerInvitationId: string,
  receivedHash: string
): boolean {
  // RapidoReach API requires MD5 hash verification per their documentation
  // Hash format: MD5(transactionId:offerInvitationId:secretKey)
  const dataToHash = `${transactionId}:${offerInvitationId}:${secretKey}`;
  const expectedHash = crypto
    .createHash("md5")
    .update(dataToHash)
    .digest("hex");

  return sameHash(receivedHash, expectedHash);
}

/** Whether TheoremReach signed this exact request with our key. */
function isSignedByTheorem(
  input: Record<string, unknown>,
  hash: string
): boolean {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (key !== "hash" && value !== undefined) {
      params.append(key, String(value));
    }
  }
  return verifyTheoremReachHash(
    theoremApiKey() ?? "",
    `/survey/theorem/postback?${params.toString()}`,
    hash
  );
}

/**
 * Runs a Theorem points change. An amount no survey may pay is refused; any
 * other failure means the points were not saved, and `fail` ends the request
 * with an error so TheoremReach sends it again.
 */
async function settleTheorem(
  transactionId: string,
  change: () => Promise<unknown>,
  fail: () => never
): Promise<"saved" | "refused"> {
  try {
    await change();
    return "saved";
  } catch (error) {
    if (error instanceof PointsRefusedError) {
      console.error(error.message);
      return "refused";
    }
    console.error(`Could not save Theorem points for ${transactionId}:`, error);
    return fail();
  }
}

const theoremDescription = (input: {
  profiler?: number;
  screenout?: number;
  offer_name?: string;
  tx_id: string;
}): string => {
  if (input.profiler === 1) {
    return "Completed TheoremReach profile survey";
  }
  const name = input.offer_name || input.tx_id;
  return input.screenout === 1
    ? `Screen-out: ${name}`
    : `Completed TheoremReach survey: ${name}`;
};

// Read when a postback arrives, not when the module loads, so the handlers
// follow the environment they actually run in.
const rapidoApiKey = () => process.env.RAPIDO_API_KEY;
const rapidoSecureHash = () => process.env.RAPIDO_SECURE_HASH;
const theoremApiKey = () => process.env.THEOREM_API_KEY;

export const rapidoPostbackHandler = publicProcedure
  .meta(
    openapi({
      method: "GET",
      path: "/survey/rapido/postback",
      tags: ["survey", "rapido"],
      summary: "RapidoReach postback endpoint",
      description:
        "Receives survey conversion notifications from RapidoReach. See docs: https://docs.rapidoreach.com/docs/v2/api/callbacks",
    })
  )
  .input(
    z.object({
      cmd: z.string().optional(),
      userId: z.string().optional(),
      endUserId: z.string(),
      amt: z.coerce.number().optional(),
      offerInvitationId: z.string().optional(),
      status: z.string(),
      oidHash: z.string().optional(),
      currencyAmt: z.coerce.number().optional(),
      transactionId: z.string().optional(),
      txnHash: z.string().optional(),
      sub_id: z.string().optional(),
      offerTitle: z.string().optional(),
    })
  )
  .output(z.union([z.object({ success: z.number() })]))
  .handler(async ({ input, context, errors }) => {
    // Not the signatures: anyone who reads the logs could replay them.
    console.log(
      "Received Rapido postback:",
      without(input, ["oidHash", "txnHash"])
    );
    const {
      endUserId,
      status,
      currencyAmt,
      transactionId,
      offerInvitationId,
      oidHash,
    } = input;
    const { payload } = context;

    if (!rapidoApiKey()) {
      throw errors.BAD_REQUEST({
        message: "Rapido not configured",
      });
    }

    const secureHash = rapidoSecureHash();
    if (!secureHash) {
      throw errors.BAD_REQUEST({
        message: "Rapido secure hash not configured",
      });
    }

    // Verify hash - all three parameters are required for verification
    if (!(oidHash && transactionId && offerInvitationId)) {
      console.error("Missing required parameters for hash verification:", {
        oidHash: !!oidHash,
        transactionId: !!transactionId,
        offerInvitationId: !!offerInvitationId,
      });
      return { success: 0 };
    }

    const isValid = verifyRapidoReachHash(
      secureHash,
      transactionId,
      offerInvitationId,
      oidHash
    );
    if (!isValid) {
      console.error("Invalid hash in Rapido postback:", oidHash);
      return { success: 0 };
    }

    const user = await payload.findByID({
      collection: "users",
      id: endUserId,
      disableErrors: true,
    });

    if (!user) {
      console.error(`User not found: ${endUserId}`);
      return { success: 0 };
    }

    const statusUpper = status?.toUpperCase();
    if (statusUpper === "COMPLETE" && currencyAmt && currencyAmt > 0) {
      const points = Math.floor(currencyAmt);
      const settings = await readSurveySettings(payload);
      try {
        const outcome = await awardProviderPoints(
          payload,
          {
            provider: "rapido",
            transactionId,
            userId: endUserId,
            points,
            description: `Completed RapidoReach survey: ${input.offerTitle || transactionId}`,
            title: "Survey Completed",
            body: `You earned ${points} points!`,
          },
          {
            maxPoints: settings.maxPointsPerAward,
            dailyCap: settings.dailyPointsCap,
          }
        );
        console.log(
          `Rapido transaction ${transactionId}: ${outcome} ${points} points for user ${endUserId}`
        );
      } catch (error) {
        if (error instanceof PointsRefusedError) {
          // Permanent: answering "not done" would only make Rapido retry.
          console.error(error.message);
          return { success: 1 };
        }
        // Answering "not done" lets RapidoReach try again where it can.
        console.error(
          `Could not save Rapido points for ${transactionId}: ${String(error)}`
        );
        return { success: 0 };
      }
    } else if (statusUpper === "QUOTAFULL" || statusUpper === "TERMINATION") {
      console.log(
        `User ${endUserId} screen-out (${status}) for transaction ${transactionId}`
      );
    }

    return { success: 1 };
  });

export const theoremPostbackHandler = publicProcedure
  .meta(
    openapi({
      method: "GET",
      path: "/survey/theorem/postback",
      tags: ["survey", "theorem"],
      summary: "TheoremReach postback endpoint",
      description:
        "Receives survey conversion notifications from TheoremReach.",
    })
  )
  .input(
    z.object({
      reward: z.coerce.number(),
      currency: z.coerce.number().optional(),
      user_id: z.string(),
      tx_id: z.string(),
      hash: z.string().optional(),
      reversal: z.string().optional(),
      debug: z.string().optional(),
      transaction_id: z.string().optional(),
      screenout: z.coerce.number().optional(),
      profiler: z.coerce.number().optional(),
      status: z.string().optional(),
      offer: z.string().optional(),
      offer_name: z.string().optional(),
      ip: z.string().optional(),
      offer_id: z.string().optional(),
      placement_id: z.string().optional(),
    })
  )
  .output(
    z.union([
      z.object({ success: z.boolean() }),
      z.object({ error: z.string() }),
    ])
  )
  .handler(async ({ input, context, errors }) => {
    // Not the signature: anyone who reads the logs could replay it.
    console.log("Received Theorem postback:", without(input, ["hash"]));
    const { reward, user_id, tx_id, hash, reversal, debug } = input;
    const { payload } = context;

    if (!theoremApiKey()) {
      throw errors.BAD_REQUEST({
        message: "Theorem not configured",
      });
    }

    // Every postback must be signed. Without this check, a request with no
    // hash would skip verification and could credit any user any amount.
    if (!hash) {
      console.error("Theorem postback without a hash, ignoring");
      return { error: "Invalid hash" };
    }

    if (!isSignedByTheorem(input, hash)) {
      console.error("Invalid hash in Theorem postback");
      return { error: "Invalid hash" };
    }

    if (debug === "true") {
      console.log("Debug callback, ignoring");
      return { success: true, message: "Debug callback ignored" };
    }

    const fail = (): never => {
      throw errors.INTERNAL_SERVER_ERROR({
        message: "Could not save the points",
      });
    };

    if (reversal === "true") {
      await settleTheorem(
        tx_id,
        () =>
          reverseProviderPoints(payload, {
            provider: "theorem",
            transactionId: tx_id,
            requested: Math.floor(Math.abs(reward)),
            description: `TheoremReach reversal: ${tx_id}`,
            title: "Survey Points Reversed",
            body: (points) =>
              `${points} points have been reversed from your account due to a survey validation issue.`,
          }),
        fail
      );
      return { success: true };
    }

    if (reward > 0) {
      const user = await payload.findByID({
        collection: "users",
        id: user_id,
        disableErrors: true,
      });

      if (!user) {
        console.error(`User not found: ${user_id}`);
        return { success: true };
      }

      const points = Math.floor(reward);
      const settings = await readSurveySettings(payload);
      await settleTheorem(
        tx_id,
        () =>
          awardProviderPoints(
            payload,
            {
              provider: "theorem",
              transactionId: tx_id,
              userId: user_id,
              points,
              description: theoremDescription(input),
              title: "Survey Completed",
              body: `You earned ${points} points!`,
            },
            {
              maxPoints: settings.maxPointsPerAward,
              dailyCap: settings.dailyPointsCap,
            }
          ),
        fail
      );
      // A refusal is permanent; settleTheorem logged it. Answer success so
      // TheoremReach does not retry an award that can never be paid.
    }

    return { success: true };
  });
