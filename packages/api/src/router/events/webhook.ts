import { verifyShowsSignature } from "../../lib/shows/signature";

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

/**
 * The seam Task 6 fills in: once the signature is verified and the envelope
 * parsed, every effect goes through here. It returns "ignored" today because
 * Task 6 owns order state and points; "failed" asks the handler to answer 503
 * so Shows retries. Keep it the only place that writes.
 */
export function applyEvent(_event: ShowsWebhookEnvelope): ShowsApplyResult {
  return "ignored";
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
