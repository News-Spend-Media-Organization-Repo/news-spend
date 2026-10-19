import { sendNotification } from "@news-spend-media/payload/lib/send-notification";
import { MAX_SURVEY_POINTS } from "@news-spend-media/payload/lib/surveyPoints";
import type { BasePayload } from "payload";

import { withKeyedLock } from "../../lib/keyedLock";

/**
 * Points for survey transactions reported by a provider's postback.
 *
 * A postback is a request from outside, and providers retry and repeat them,
 * so everything here is keyed on the provider's own transaction id:
 *
 * - an award is made once per transaction, however often it arrives, and
 *   whoever and however much the repeat names;
 * - a reversal takes back what that transaction paid, once, and never more;
 * - an award is a whole number of points between 1 and `MAX_SURVEY_POINTS`.
 *
 * The transaction is recorded on the activity itself (`metadata`), so the
 * ledger is its own record of what has been processed.
 */

export type Provider = "cpx" | "rapido" | "theorem";

/** The points were not an amount a survey may pay. */
export class PointsRefusedError extends Error {}

type Kind = "award" | "reversal";

const lockKey = (provider: Provider, transactionId: string) =>
  `${provider}:${transactionId}`;

export const isValidAward = (points: number): boolean =>
  Number.isInteger(points) && points > 0 && points <= MAX_SURVEY_POINTS;

async function findEntry(
  payload: BasePayload,
  provider: Provider,
  transactionId: string,
  kind: Kind
) {
  const { docs } = await payload.find({
    collection: "activities",
    where: {
      and: [
        { "metadata.provider": { equals: provider } },
        { "metadata.transactionId": { equals: transactionId } },
        { "metadata.kind": { equals: kind } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  return docs[0] ?? null;
}

/** A failed notification must not undo or fail the points that were saved. */
async function notifyBestEffort(
  payload: BasePayload,
  userId: string,
  message: { title: string; body: string; data: Record<string, unknown> }
): Promise<void> {
  try {
    const { docs: pushTokens } = await payload.find({
      collection: "push-tokens",
      where: { user: { in: [userId] } },
    });
    await sendNotification({ pushTokens, ...message } as never);
  } catch (error) {
    console.error("Could not send the survey notification:", error);
  }
}

export async function awardProviderPoints(
  payload: BasePayload,
  award: {
    provider: Provider;
    transactionId: string;
    userId: string;
    points: number;
    description: string;
    title: string;
    body: string;
  }
): Promise<"awarded" | "duplicate"> {
  const { provider, transactionId, userId, points } = award;
  if (!isValidAward(points)) {
    throw new PointsRefusedError(
      `${provider} transaction ${transactionId}: ${points} points is outside 1-${MAX_SURVEY_POINTS}`
    );
  }

  return await withKeyedLock(lockKey(provider, transactionId), async () => {
    if (await findEntry(payload, provider, transactionId, "award")) {
      return "duplicate";
    }

    await payload.create({
      collection: "activities",
      data: {
        type: "point",
        point: points,
        description: award.description,
        action: "surveyTask",
        user: userId,
        metadata: { provider, transactionId, kind: "award" },
      },
    });

    await notifyBestEffort(payload, userId, {
      title: award.title,
      body: award.body,
      data: { type: "survey", provider, transactionId },
    });
    return "awarded";
  });
}

/**
 * Takes back what a transaction paid. `requested` is how much the provider
 * says to reverse; the reversal is never more than was paid, and is made to
 * the user who was paid, not whoever the request names.
 */
export async function reverseProviderPoints(
  payload: BasePayload,
  reversal: {
    provider: Provider;
    transactionId: string;
    requested: number;
    description: string;
    title: string;
    body: (points: number) => string;
  }
): Promise<"reversed" | "duplicate" | "nothing_to_reverse"> {
  const { provider, transactionId } = reversal;

  return await withKeyedLock(lockKey(provider, transactionId), async () => {
    const award = await findEntry(payload, provider, transactionId, "award");
    if (!award) {
      return "nothing_to_reverse";
    }
    if (await findEntry(payload, provider, transactionId, "reversal")) {
      return "duplicate";
    }

    const paid = Number(award.point);
    const points = Math.min(
      paid,
      reversal.requested > 0 ? Math.floor(reversal.requested) : paid
    );
    const user = award.user;
    const userId = typeof user === "object" && user !== null ? user.id : user;

    await payload.create({
      collection: "activities",
      data: {
        type: "point",
        point: -points,
        description: reversal.description,
        action: "pointReversal",
        user: userId,
        metadata: { provider, transactionId, kind: "reversal" },
      },
    });

    await notifyBestEffort(payload, String(userId), {
      title: reversal.title,
      body: reversal.body(points),
      data: { type: "survey", provider, transactionId },
    });
    return "reversed";
  });
}
