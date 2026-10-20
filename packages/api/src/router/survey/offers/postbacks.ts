import crypto from "node:crypto";

import { openapi } from "@orpc/openapi";
import z from "zod";

import { publicProcedure } from "../../..";
import {
  awardProviderPoints,
  PointsRefusedError,
  reverseProviderPoints,
} from "../providerPoints";

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

/**
 * The signature TheoremReach sends: HMAC-SHA1 of the exact callback URL,
 * base64, with `+`→`-`, `/`→`_` and the trailing `=` removed.
 */
export function signTheoremUrl(secretKey: string, url: string): string {
  return crypto
    .createHmac("sha1", secretKey)
    .update(url)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function verifyTheoremReachHash(
  secretKey: string,
  url: string,
  receivedHash: string
): boolean {
  return sameHash(receivedHash, signTheoremUrl(secretKey, url));
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

/** Drops `hash` from a raw query string, leaving every other byte untouched. */
function removeHashParam(rawQuery: string): string {
  return rawQuery
    .split("&")
    .filter((part) => {
      const separator = part.indexOf("=");
      const name = separator === -1 ? part : part.slice(0, separator);
      return name !== "hash";
    })
    .join("&");
}

type TheoremSignedUrl = {
  url: string;
  /** Where the public origin came from, for diagnosing a bad configuration. */
  source: "env" | "headers";
  path: string;
};

/**
 * The URL TheoremReach signed: the public origin + the path as served + the
 * query in their order and encoding, with `hash` removed. Never rebuild this
 * from parsed input — any reordering or re-encoding changes the signature.
 */
function theoremUrlToSign(
  request: { url?: string; headers: Headers } | undefined
): TheoremSignedUrl | null {
  if (!request?.url) {
    return null;
  }

  const withoutQuery = request.url.split("?")[0] ?? "";
  const afterScheme = withoutQuery.slice(withoutQuery.indexOf("://") + 3);
  const pathStart = afterScheme.indexOf("/");
  const path = pathStart === -1 ? "/" : afterScheme.slice(pathStart);
  const rawQuery = request.url.split("?").slice(1).join("?");
  const query = removeHashParam(rawQuery);

  const configured = process.env.THEOREM_CALLBACK_BASE_URL?.trim();
  let base: string;
  let source: TheoremSignedUrl["source"];

  if (configured) {
    base = configured.replace(/\?+$/, "");
    source = "env";
  } else {
    // Behind Railway the request's own host is internal.
    const url = new URL(request.url);
    const forwarded = (name: string) =>
      request.headers.get(name)?.split(",")[0]?.trim();
    const proto =
      forwarded("x-forwarded-proto") ?? url.protocol.replace(":", "");
    const host =
      forwarded("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
    base = `${proto}://${host}${path}`;
    source = "headers";
  }

  return { url: query ? `${base}?${query}` : base, source, path };
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
  transactionId: string;
}): string => {
  if (input.profiler === 1) {
    return "Completed TheoremReach profile survey";
  }
  const name = input.offer_name || input.transactionId;
  return input.screenout === 1
    ? `Screen-out: ${name}`
    : `Completed TheoremReach survey: ${name}`;
};

/** Every parameter the handler understands; anything else is only logged. */
const THEOREM_PARAMS = new Set([
  "reward",
  "currency",
  "user_id",
  "tx_id",
  "transaction_id",
  "hash",
  "reversal",
  "debug",
  "screenout",
  "profiler",
  "status",
  "offer",
  "offer_name",
  "ip",
  "offer_id",
  "placement_id",
  "partner_id",
]);

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
      try {
        const outcome = await awardProviderPoints(payload, {
          provider: "rapido",
          transactionId,
          userId: endUserId,
          points,
          description: `Completed RapidoReach survey: ${input.offerTitle || transactionId}`,
          title: "Survey Completed",
          body: `You earned ${points} points!`,
        });
        console.log(
          `Rapido transaction ${transactionId}: ${outcome} ${points} points for user ${endUserId}`
        );
      } catch (error) {
        // Answering "not done" lets RapidoReach try again where it can.
        console.error(
          error instanceof PointsRefusedError
            ? error.message
            : `Could not save Rapido points for ${transactionId}: ${String(error)}`
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
    z
      .object({
        reward: z.coerce.number().optional(),
        currency: z.coerce.number().optional(),
        user_id: z.string().optional(),
        tx_id: z.string().optional(),
        transaction_id: z.string().optional(),
        hash: z.string().optional(),
        reversal: z.string().optional(),
        debug: z.string().optional(),
        screenout: z.coerce.number().optional(),
        profiler: z.coerce.number().optional(),
        status: z.string().optional(),
        offer: z.string().optional(),
        offer_name: z.string().optional(),
        ip: z.string().optional(),
        offer_id: z.string().optional(),
        placement_id: z.string().optional(),
        partner_id: z.string().optional(),
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
    // Not the signature: anyone who reads the logs could replay it.
    console.log("Received Theorem postback:", without(input, ["hash"]));
    const { payload } = context;

    const unknown = Object.keys(input).filter(
      (key) => !THEOREM_PARAMS.has(key)
    );
    if (unknown.length > 0) {
      console.log("Theorem postback has unknown parameters:", unknown);
    }

    // The dashboard's test button sets debug=true and omits the transaction and
    // partner ids. It never credits, so it needs no hash and no user.
    if (input.debug === "true") {
      console.log("Debug callback, ignoring");
      return { success: true };
    }

    if (!theoremApiKey()) {
      throw errors.BAD_REQUEST({
        message: "Theorem not configured",
      });
    }

    // Every crediting postback must be signed. Without this check, a request
    // with no hash would skip verification and could credit any user any amount.
    const hash = input.hash;
    if (!hash) {
      console.error("Theorem postback without a hash, ignoring", {
        parameters: Object.keys(input),
      });
      return { error: "Invalid hash" };
    }

    const request = context.request;
    const requestUrl = request && "url" in request ? request.url : undefined;
    const signedUrl =
      request && typeof requestUrl === "string"
        ? theoremUrlToSign({ url: requestUrl, headers: request.headers })
        : null;
    if (!signedUrl) {
      console.error("Theorem postback has no request URL to verify");
      return { error: "Invalid hash" };
    }

    if (!verifyTheoremReachHash(theoremApiKey() ?? "", signedUrl.url, hash)) {
      console.error("Invalid hash in Theorem postback", {
        origin: signedUrl.source,
        path: signedUrl.path,
      });
      return { error: "Invalid hash" };
    }

    const transactionId = input.transaction_id ?? input.tx_id;
    const userId = input.user_id;
    if (!(transactionId && userId)) {
      console.error("Theorem postback missing required parameters:", {
        missing: [
          transactionId ? undefined : "transaction_id or tx_id",
          userId ? undefined : "user_id",
        ].filter(Boolean),
        received: Object.keys(input),
      });
      return { error: "Missing required parameters" };
    }

    const fail = (): never => {
      throw errors.INTERNAL_SERVER_ERROR({
        message: "Could not save the points",
      });
    };

    // TODO(owner): how TheoremReach signals a reversal, and what `reward` means
    // on one, is not documented publicly. Kept as it was pending their answer.
    if (input.reversal === "true") {
      await settleTheorem(
        transactionId,
        () =>
          reverseProviderPoints(payload, {
            provider: "theorem",
            transactionId,
            requested: Math.floor(Math.abs(input.reward ?? 0)),
            description: `TheoremReach reversal: ${transactionId}`,
            title: "Survey Points Reversed",
            body: (points) =>
              `${points} points have been reversed from your account due to a survey validation issue.`,
          }),
        fail
      );
      return { success: true };
    }

    const reward = input.reward;
    if (reward === undefined) {
      console.error("Theorem postback has no reward:", {
        received: Object.keys(input),
      });
      return { error: "Missing required parameters" };
    }

    if (reward > 0) {
      const user = await payload.findByID({
        collection: "users",
        id: userId,
        disableErrors: true,
      });

      if (!user) {
        console.error(`User not found: ${userId}`);
        return { success: true };
      }

      const points = Math.floor(reward);
      const outcome = await settleTheorem(
        transactionId,
        () =>
          awardProviderPoints(payload, {
            provider: "theorem",
            transactionId,
            userId,
            points,
            description: theoremDescription({ ...input, transactionId }),
            title: "Survey Completed",
            body: `You earned ${points} points!`,
          }),
        fail
      );
      if (outcome === "refused") {
        return { error: "Reward not accepted" };
      }
    }

    return { success: true };
  });
