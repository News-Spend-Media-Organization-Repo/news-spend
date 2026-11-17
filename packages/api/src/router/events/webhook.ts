import { verifyShowsSignature } from "../../lib/shows/signature";

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
};

export type ShowsApplyResult = "applied" | "ignored";

export type ShowsApplyEvent = (
  event: ShowsWebhookEnvelope
) => Promise<ShowsApplyResult> | ShowsApplyResult;

/**
 * The seam Task 6 fills in: once the signature is verified and the envelope
 * parsed, every effect goes through here. It returns "ignored" today because
 * Task 6 owns order state and points; keep it the only place that writes.
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
 * 405 for the wrong method, 503 when the secret is missing, and 5xx only for a
 * fault on our side.
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

  const rawBody = await req.text();
  const valid = verifyShowsSignature(
    rawBody,
    req.headers,
    secret,
    Math.floor(Date.now() / 1000)
  );

  if (!valid) {
    // Never the body or the signature: this is unverified input. The flags are
    // enough to tell a Shows misconfiguration from a forged request.
    console.warn("[events] Shows webhook rejected", {
      hasSignature: req.headers.has("shows-webhook-signature"),
      hasTimestamp: req.headers.has("shows-webhook-timestamp"),
    });
    return json({ message: "Unauthorized" }, 401);
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
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
