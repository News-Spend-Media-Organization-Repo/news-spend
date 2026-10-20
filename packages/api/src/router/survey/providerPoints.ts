import { sendNotification } from "@news-spend-media/payload/lib/send-notification";
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
 * - an award is a whole number of points between 1 and the configured maximum,
 *   and the user's survey points for the day stay inside the configured cap.
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

const providerRef = (provider: Provider, transactionId: string, kind: Kind) =>
  `${provider}:${transactionId}:${kind}`;

/**
 * A provider award that another process already wrote. Payload wraps database
 * errors, so the Postgres code can sit anywhere down the cause chain.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 10; depth += 1) {
    if (typeof current !== "object" || current === null) {
      return false;
    }
    if ((current as { code?: unknown }).code === "23505") {
      return true;
    }
    // Payload's Drizzle adapter converts 23505 into a ValidationError on the
    // field, with no original error left in the cause chain.
    const validation = current as {
      name?: unknown;
      data?: { errors?: Array<{ path?: unknown }> };
    };
    if (
      validation.name === "ValidationError" &&
      validation.data?.errors?.some((entry) => entry.path === "providerRef")
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export const isValidAward = (points: number, maxPoints: number): boolean =>
  Number.isInteger(points) && points > 0 && points <= maxPoints;

export type AwardLimits = { maxPoints: number; dailyCap: number };

/** Points this user has been paid for surveys since midnight UTC. */
async function surveyPointsPaidToday(
  payload: BasePayload,
  userId: string
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { docs } = await payload.find({
    collection: "activities",
    where: {
      and: [
        { user: { equals: userId } },
        { action: { equals: "surveyTask" } },
        { point: { greater_than: 0 } },
        { createdAt: { greater_than: startOfDay.toISOString() } },
      ],
    },
    pagination: false,
    depth: 0,
  });

  return docs.reduce((sum, doc) => sum + Number(doc.point ?? 0), 0);
}

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
  },
  limits: AwardLimits
): Promise<"awarded" | "duplicate"> {
  const { provider, transactionId, userId, points } = award;
  if (!isValidAward(points, limits.maxPoints)) {
    throw new PointsRefusedError(
      `${provider} transaction ${transactionId}: ${points} points is outside 1-${limits.maxPoints}`
    );
  }

  return await withKeyedLock(lockKey(provider, transactionId), async () => {
    if (await findEntry(payload, provider, transactionId, "award")) {
      return "duplicate";
    }

    // Different transactions for the same user must not both read the same
    // total. This serialises them per user on this process; across processes
    // the cap is best effort, and the per-award maximum bounds the overshoot.
    return await withKeyedLock(`user:${userId}`, async () => {
      const paidToday = await surveyPointsPaidToday(payload, userId);
      if (paidToday + points > limits.dailyCap) {
        throw new PointsRefusedError(
          `${provider} transaction ${transactionId}: ${paidToday + points} points today would cross the ${limits.dailyCap} daily cap`
        );
      }

      try {
        await payload.create({
          collection: "activities",
          data: {
            type: "point",
            point: points,
            description: award.description,
            action: "surveyTask",
            user: userId,
            providerRef: providerRef(provider, transactionId, "award"),
            metadata: { provider, transactionId, kind: "award" },
          },
        });
      } catch (error) {
        // Two instances can pass the in-memory checks together; the unique
        // index decides. The one that loses answers like a normal duplicate.
        if (
          isUniqueViolation(error) ||
          (await findEntry(payload, provider, transactionId, "award"))
        ) {
          return "duplicate";
        }
        throw error;
      }

      await notifyBestEffort(payload, userId, {
        title: award.title,
        body: award.body,
        data: { type: "survey", provider, transactionId },
      });
      return "awarded";
    });
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

    try {
      await payload.create({
        collection: "activities",
        data: {
          type: "point",
          point: -points,
          description: reversal.description,
          action: "pointReversal",
          user: userId,
          providerRef: providerRef(provider, transactionId, "reversal"),
          metadata: { provider, transactionId, kind: "reversal" },
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return "duplicate";
      }
      throw error;
    }

    await notifyBestEffort(payload, String(userId), {
      title: reversal.title,
      body: reversal.body(points),
      data: { type: "survey", provider, transactionId },
    });
    return "reversed";
  });
}
