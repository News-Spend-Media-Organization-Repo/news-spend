import { getPayload } from "@news-spend-media/payload";
import type { BasePayload } from "payload";

import { verifyShowsSignature } from "../../lib/shows/signature";
import { applyOrderState, type TicketOrderState } from "../../lib/ticketOrders";

/** A webhook envelope is small; anything larger is not a Shows event. */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * The envelope Shows wraps every webhook event in.
 *
 * Only the fields the app acts on are typed; `aggregate` names the object the
 * event is about and the version used to order events.
 */
export type ShowsWebhookEnvelope = {
  id: string;
  type: string;
  schema_version: string;
  environment: string;
  project: string;
  occurred_at: string;
  aggregate: {
    type: string;
    id: string;
    version?: number;
  } | null;
  /** Event-specific body: the amount, reference, refund totals, and so on. */
  data: Record<string, unknown> | null;
};

/**
 * `failed` means "signed and ours, but not applied yet" — an unknown reference,
 * for example. The handler asks Shows to retry that one; it is never silently
 * acknowledged.
 */
export type ShowsApplyResult = "applied" | "ignored" | "failed";

export type ShowsApplyEvent = (
  event: ShowsWebhookEnvelope
) => Promise<ShowsApplyResult> | ShowsApplyResult;

const ORDER_STATES: readonly TicketOrderState[] = [
  "paid",
  "expired",
  "cancelled",
  "refunded",
  "failed",
];

const DECIMAL_INTEGER = /^\d+$/;

type ShowsEventData = {
  reference: string | null;
  amountMinor: number | null;
  refundedMinor: number | null;
  refundId: string | null;
  orderVersion: string | null;
  refundVersion: string | null;
  state: TicketOrderState | null;
  eventId: string | null;
};

function firstString(
  data: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = nonEmpty(data[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function firstInteger(
  data: Record<string, unknown>,
  keys: readonly string[]
): number | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isSafeInteger(value)) {
      return value;
    }
    // Amounts also arrive as decimal strings from some Shows payloads.
    if (typeof value === "string" && DECIMAL_INTEGER.test(value)) {
      const parsed = Number(value);
      if (Number.isSafeInteger(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function readState(value: unknown): TicketOrderState | null {
  return typeof value === "string" &&
    ORDER_STATES.includes(value as TicketOrderState)
    ? (value as TicketOrderState)
    : null;
}

/**
 * Read the event-specific body.
 *
 * The exact shape is UNVERIFIED pending sandbox captures: it accepts the
 * purchase reference, amount, refund id, version and state under the snake_case
 * and camelCase spellings Shows has used elsewhere, and treats anything else
 * as absent rather than guessing.
 */
function readShowsEventData(event: ShowsWebhookEnvelope): ShowsEventData {
  const data = event.data ?? {};
  const aggregateVersion =
    event.aggregate && typeof event.aggregate.version === "number"
      ? String(event.aggregate.version)
      : null;

  return {
    reference: firstString(data, ["purchase", "reference"]),
    amountMinor: firstInteger(data, ["amount_minor", "amountMinor"]),
    refundedMinor: firstInteger(data, ["refunded_minor", "refundedMinor"]),
    refundId:
      firstString(data, ["refund_id", "refundId", "entity_id"]) ??
      (event.aggregate?.type === "refund" ? event.aggregate.id : null),
    orderVersion:
      firstString(data, ["order_version", "orderVersion", "version"]) ??
      aggregateVersion,
    refundVersion:
      firstString(data, ["refund_version", "refundVersion", "version"]) ??
      aggregateVersion,
    state: readState(data.state ?? data.status),
    eventId:
      firstString(data, ["event_id", "eventId", "event"]) ??
      (event.aggregate?.type === "event" ? event.aggregate.id : null),
  };
}

/**
 * The one place ticket order state and its points are written.
 *
 * A signed event naming an order we cannot find is `failed`, never a silent
 * acknowledgement: Shows retries it, and the alternative is a paid order that
 * never becomes paid or pays no points. `webhook.test` never reaches here.
 */
async function applyTransition(
  payload: BasePayload,
  data: ShowsEventData
): Promise<ShowsApplyResult> {
  if (!data.reference) {
    return "failed";
  }
  // A state Shows knows but this app does not (notably `pending`) is not
  // actionable; failing it would ask Shows to retry it for ever.
  if (!data.state) {
    return "ignored";
  }
  if (data.state === "paid" && data.amountMinor === null) {
    return "failed";
  }
  const refundedMinor = data.refundedMinor ?? 0;
  return await applyOrderState(payload, {
    reference: data.reference,
    state: data.state,
    orderVersion: data.orderVersion ?? undefined,
    amountMinor: data.amountMinor ?? undefined,
    // A transition that reports a refund carries the money that was already
    // given back: keyed by the total so it is applied (and reversed) once.
    ...(refundedMinor > 0
      ? { refundedMinor, refundId: `transition:${refundedMinor}` }
      : {}),
  });
}

async function applyRefund(
  payload: BasePayload,
  data: ShowsEventData
): Promise<ShowsApplyResult> {
  if (!data.reference || data.amountMinor === null) {
    return "failed";
  }
  const refundedMinor = data.refundedMinor ?? data.amountMinor;
  return await applyOrderState(payload, {
    reference: data.reference,
    state: data.state ?? "refunded",
    orderVersion: data.refundVersion ?? undefined,
    refundedMinor,
    // Without an id the money would be recorded but the points never taken
    // back; the total is the most specific stable key available.
    refundId: data.refundId ?? `refund:${refundedMinor}`,
  });
}

async function applyExpiry(
  payload: BasePayload,
  data: ShowsEventData
): Promise<ShowsApplyResult> {
  if (!data.reference) {
    return "failed";
  }
  const { docs } = await payload.find({
    collection: "ticket-orders",
    where: { reference: { equals: data.reference } },
    limit: 1,
    depth: 0,
  });
  // An order that already left pending cannot be expired afterwards.
  if (docs[0]?.state !== "pending") {
    return "ignored";
  }
  return await applyOrderState(payload, {
    reference: data.reference,
    state: "expired",
    orderVersion: data.orderVersion ?? undefined,
  });
}

/** Cancelling is a write per order, so one delivery gets a bounded budget. */
const CANCEL_BATCH = 100;
const CANCEL_LIMIT = 500;

async function applyCancellation(
  payload: BasePayload,
  data: ShowsEventData
): Promise<ShowsApplyResult> {
  if (!data.eventId) {
    return "ignored";
  }
  const eventId = data.eventId;

  let applied = false;
  let processed = 0;

  while (processed < CANCEL_LIMIT) {
    // Page one each time: cancelling a row takes it out of the filter, so the
    // next batch moves up rather than being skipped by a growing page number.
    const { docs: orders } = await payload.find({
      collection: "ticket-orders",
      where: {
        and: [{ eventId: { equals: eventId } }, { state: { equals: "paid" } }],
      },
      limit: CANCEL_BATCH,
      page: 1,
      depth: 0,
    });

    let batchApplied = false;
    for (const row of orders) {
      processed += 1;
      if (!row.reference) {
        continue;
      }
      const result = await applyOrderState(payload, {
        reference: row.reference,
        state: "cancelled",
      });
      applied ||= result === "applied";
      batchApplied ||= result === "applied";
    }

    // Nothing in this batch could be cancelled (for example a paid row with no
    // reference); stop rather than querying the same rows for ever.
    if (!batchApplied) {
      break;
    }
  }

  if (processed >= CANCEL_LIMIT) {
    // A full budget means there is more to do than one delivery can hold.
    // Failing the event asks Shows to redeliver, and the next delivery resumes
    // from the rows still paid instead of repeating this budget.
    const { totalDocs } = await payload.count({
      collection: "ticket-orders",
      where: {
        and: [{ eventId: { equals: eventId } }, { state: { equals: "paid" } }],
      },
    });
    payload.logger.warn(
      `event cancellation paused after ${CANCEL_LIMIT} orders; ${totalDocs} still paid for ${eventId}`
    );
    return "failed";
  }

  // Points are deliberately untouched: Shows' refund event is the only thing
  // that takes money (and points) back.
  return applied ? "applied" : "ignored";
}

export async function applyEvent(
  event: ShowsWebhookEnvelope,
  injected?: BasePayload
): Promise<ShowsApplyResult> {
  const data = readShowsEventData(event);
  const connection = async () => injected ?? (await getPayload());

  switch (event.type) {
    case "order.transitioned":
      return applyTransition(await connection(), data);
    case "refund.updated":
      return applyRefund(await connection(), data);
    case "purchase.expired":
      return applyExpiry(await connection(), data);
    case "event.cancelled":
      return applyCancellation(await connection(), data);
    default:
      // Includes inventory.sold_out, webhook.test, and any newer event type.
      return "ignored";
  }
}

/**
 * Shows' ticketing webhook.
 *
 * Called by Shows, never by the app, and unauthenticated in the usual sense:
 * Shows holds no session with us, so the HMAC over the exact bytes it sent is
 * the ONLY thing between a forged request and a paid order or awarded points.
 * The body is read as text and verified before it is parsed; nothing is read
 * out of it before the signature passes.
 *
 * Status codes are a retry protocol: 2xx for anything already dealt with
 * (including a signed event we cannot act on), 401 only for a bad signature,
 * 405 for the wrong method, 413 for a body larger than a Shows event, and 503
 * when the secret is missing, the signature is genuine but stale, or an effect
 * cannot be applied yet. A 5xx is only for a fault on our side.
 */
export async function showsWebhookHandler(
  req: Request,
  apply: ShowsApplyEvent = applyEvent
): Promise<Response> {
  const secret = process.env.SHOWS_WEBHOOK_SECRET?.trim();
  if (!secret) {
    // Nothing is configured, so nothing can be verified. Accepting it would be
    // pretending; 503 lets Shows retry once we are wired up.
    return json({ message: "Webhook is not configured" }, 503);
  }

  if (req.method !== "POST") {
    return json({ message: "Method not allowed" }, 405);
  }

  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length > MAX_BODY_BYTES) {
      return json({ message: "Body too large" }, 413);
    }
  }

  const rawBody = await req.text();
  // The header can be absent or wrong, so the bytes that actually arrived are
  // the real limit. HMAC over an unbounded body would be free work for anyone.
  if (Buffer.byteLength(rawBody, "utf-8") > MAX_BODY_BYTES) {
    return json({ message: "Body too large" }, 413);
  }

  const verdict = verifyShowsSignature(
    rawBody,
    req.headers,
    secret,
    Math.floor(Date.now() / 1000)
  );

  if (verdict === "bad") {
    // Never the body or the signature: this is unverified input. The flags are
    // enough to tell a Shows misconfiguration from a forged request.
    console.warn("[events] Shows webhook rejected", {
      hasSignature: req.headers.has("shows-webhook-signature"),
      hasTimestamp: req.headers.has("shows-webhook-timestamp"),
    });
    return json({ message: "Unauthorized" }, 401);
  }

  if (verdict === "stale") {
    // The signature is genuine but outside the window. Shows retries anything
    // that is not 2xx, so a 503 asks for a fresh delivery; a 401 would be
    // treated as permanent.
    console.warn("[events] Shows webhook rejected", {
      reason: "timestamp outside the accepted window",
    });
    return json({ message: "Stale signature" }, 503);
  }

  const envelope = parseEnvelope(rawBody);
  if (!envelope) {
    // Signed, but not something we can act on. Acknowledged so Shows stops
    // retrying; the body is not logged because it may carry buyer details.
    console.warn("[events] Shows webhook ignored", {
      reason: "body is not a usable envelope",
    });
    return json({ message: "Nothing to do", acknowledged: true }, 200);
  }

  // Another environment's or another project's event must never move our
  // money, even signed. Only configured values are compared, so a partial
  // setup still works; a missing envelope value is a mismatch.
  const expectedEnvironment = process.env.SHOWS_ENV?.trim();
  const expectedProject = process.env.SHOWS_PROJECT_ID?.trim();
  if (
    (expectedEnvironment && envelope.environment !== expectedEnvironment) ||
    (expectedProject && envelope.project !== expectedProject)
  ) {
    console.warn("[events] Shows webhook ignored", {
      id: envelope.id,
      type: envelope.type,
      reason: "environment or project mismatch",
    });
    return json({ message: "Ignored", acknowledged: true }, 200);
  }

  if (envelope.type === "webhook.test") {
    // The key-rotation probe: prove we verified it, do nothing else.
    console.info("[events] Shows webhook test", {
      id: envelope.id,
      type: envelope.type,
    });
    return json({ message: "Nothing to do", acknowledged: true }, 200);
  }

  try {
    const result = await apply(envelope);
    if (result === "failed") {
      console.warn("[events] Shows webhook deferred", {
        id: envelope.id,
        type: envelope.type,
      });
      return json({ message: "Could not process the webhook" }, 503);
    }
    console.info("[events] Shows webhook", {
      id: envelope.id,
      type: envelope.type,
    });
    return json({ message: "Processed", result }, 200);
  } catch (error) {
    // A real fault on our side: 5xx so Shows retries rather than dropping a
    // payment confirmation.
    console.error("[events] Shows webhook failed", {
      id: envelope.id,
      type: envelope.type,
      err: error,
    });
    return json({ message: "Could not process the webhook" }, 500);
  }
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseData(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseAggregate(value: unknown): ShowsWebhookEnvelope["aggregate"] {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = nonEmpty(record.type);
  const id = nonEmpty(record.id);
  if (!(type && id)) {
    return null;
  }

  const version =
    typeof record.version === "number" && Number.isSafeInteger(record.version)
      ? record.version
      : undefined;

  return version === undefined ? { type, id } : { type, id, version };
}

/**
 * Read a verified body. Every field is checked, never asserted: even a signed
 * body is JSON from the public internet. `id` and `type` are what make it
 * actionable; the rest is kept for the effects and may be absent in a newer
 * schema.
 */
function parseEnvelope(rawBody: string): ShowsWebhookEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const id = nonEmpty(record.id);
  const type = nonEmpty(record.type);
  if (!(id && type)) {
    return null;
  }

  return {
    id,
    type,
    schema_version: nonEmpty(record.schema_version) ?? "",
    environment: nonEmpty(record.environment) ?? "",
    project: nonEmpty(record.project) ?? "",
    occurred_at: nonEmpty(record.occurred_at) ?? "",
    aggregate: parseAggregate(record.aggregate),
    data: parseData(record.data),
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
