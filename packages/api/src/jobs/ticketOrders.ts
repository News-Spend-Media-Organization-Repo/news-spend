import { getPayload } from "@news-spend-media/payload";
import { Cron } from "croner";
import type { BasePayload } from "payload";

import { getPurchase } from "../lib/shows/client";
import { type ShowsConfig, showsConfigFromEnv } from "../lib/shows/config";
import { applyOrderState, type TicketOrderState } from "../lib/ticketOrders";

/**
 * Reconcile orders a webhook missed.
 *
 * The webhook is the primary source, but a lost delivery leaves a pending row
 * behind and a crash between storing `paid` and awarding points leaves the
 * points unpaid. Both are picked up here: the row is read from Shows and handed
 * to `applyOrderState`, which remains the only state writer, so a replay is
 * idempotent and the award follows the same rules as a webhook.
 */

const STALE_AFTER_MS = 30 * 1000;
const DEFAULT_MAX_AGE_HOURS = 72;
const MAX_ROWS = 50;

const RECONCILABLE_STATES: readonly TicketOrderState[] = [
  "paid",
  "expired",
  "cancelled",
  "refunded",
  "failed",
];

function isReconcilableState(value: string): value is TicketOrderState {
  return RECONCILABLE_STATES.some((state) => state === value);
}

/** The purchase's state, or null when Shows reports one we do not act on. */
function reportedState(
  value: string | null | undefined
): TicketOrderState | null {
  const state = value?.trim().toLowerCase();
  if (!state) {
    return null;
  }
  return isReconcilableState(state) ? state : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type ReconcileOptions = {
  now?: Date;
  maxAgeHours?: number;
  limit?: number;
  /** Injection seam, same as the events router's `context.shows`. */
  shows?: ShowsConfig | null;
};

async function findCandidates(
  payload: BasePayload,
  now: Date,
  maxAgeHours: number,
  limit: number
) {
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS).toISOString();
  const windowStart = new Date(
    now.getTime() - maxAgeHours * 60 * 60 * 1000
  ).toISOString();

  const { docs } = await payload.find({
    collection: "ticket-orders",
    where: {
      and: [
        { reference: { exists: true } },
        { createdAt: { greater_than: windowStart } },
        {
          or: [
            {
              and: [
                { state: { equals: "pending" } },
                { lastSyncedAt: { exists: false } },
                { createdAt: { less_than: staleBefore } },
              ],
            },
            {
              and: [
                { state: { equals: "pending" } },
                { lastSyncedAt: { exists: true } },
                { lastSyncedAt: { less_than: staleBefore } },
              ],
            },
            {
              and: [
                { state: { equals: "paid" } },
                { pointsAwarded: { equals: 0 } },
                { awardAttemptedAt: { exists: false } },
              ],
            },
          ],
        },
      ],
    },
    sort: "createdAt",
    limit,
    depth: 0,
  });

  return docs;
}

export async function reconcileTicketOrders(
  payload: BasePayload,
  options: ReconcileOptions = {}
): Promise<{ checked: number; changed: number; failed: number }> {
  const now = options.now ?? new Date();
  const maxAgeHours = options.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
  const limit = Math.min(options.limit ?? MAX_ROWS, MAX_ROWS);
  const shows =
    options.shows === undefined ? showsConfigFromEnv() : options.shows;

  const result = { checked: 0, changed: 0, failed: 0 };
  if (!shows) {
    return result;
  }

  const rows = await findCandidates(payload, now, maxAgeHours, limit);

  for (const row of rows) {
    const reference = row.reference;
    // The query excludes these; this only narrows the type.
    if (!reference) {
      continue;
    }

    result.checked += 1;
    try {
      const purchase = await getPurchase(shows, reference);
      const state = reportedState(purchase.state);
      if (!state) {
        continue;
      }

      const refundedMinor = purchase.refundedMinor ?? 0;
      const outcome = await applyOrderState(payload, {
        reference,
        state,
        amountMinor: purchase.amountMinor,
        ...(refundedMinor > 0 ? { refundedMinor } : {}),
      });

      if (outcome === "applied") {
        result.changed += 1;
      } else if (outcome === "failed") {
        result.failed += 1;
      }
    } catch (error) {
      result.failed += 1;
      payload.logger.error(
        `ticket order reconcile failed for ${reference}: ${errorMessage(error)}`
      );
    }
  }

  return result;
}

export function startTicketOrderReconcileJob(): Cron {
  const expr = "*/15 * * * *";

  // see trending.ts: an unhandled rejection here exits the process
  const job = new Cron(
    expr,
    {
      catch: (error: unknown) =>
        console.error("ticket order reconcile job failed", error),
    },
    async () => {
      try {
        // inside the try: getPayload() throws when Postgres is unreachable
        const payload = await getPayload();
        const result = await reconcileTicketOrders(payload);

        if (result.changed > 0 || result.failed > 0) {
          payload.logger.info(
            `ticket order reconcile: checked ${result.checked}, changed ${result.changed}, failed ${result.failed}`
          );
        }
      } catch (error) {
        console.error("ticket order reconcile job failed", error);
      }
    }
  );

  return job;
}

export default startTicketOrderReconcileJob;
