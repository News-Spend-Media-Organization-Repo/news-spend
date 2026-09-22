import type { DocumentViewServerProps } from "payload";
import type { ReactNode } from "react";

import { ADMIN_PATH, scopeOfRequest } from "../Analytics/access";
import { Denied, Panel, Styles } from "../Analytics/ui";

/**
 * Static documentation for a partner's technical contact, plus their own
 * webhook URL pulled live so it's never out of step with the record above.
 *
 * Deliberately never renders the webhook secret, even to staff: it already
 * has a place (the CPA Integration section on this same document) and a
 * credential shown in two places is a credential that's harder to rotate
 * cleanly. This page tells the reader where to find it instead.
 */

function Code({ children }: { children: string }): ReactNode {
  return (
    <pre
      style={{
        background: "var(--theme-elevation-50)",
        border: "1px solid var(--theme-elevation-150)",
        borderRadius: 8,
        padding: "12px 14px",
        fontSize: 12.5,
        lineHeight: 1.6,
        overflowX: "auto",
        margin: 0,
      }}
    >
      <code>{children}</code>
    </pre>
  );
}

function Field({
  name,
  type,
  note,
}: {
  name: string;
  type: string;
  note: string;
}): ReactNode {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 13 }}>
      <code style={{ minWidth: 130 }}>{name}</code>
      <span className="ana-muted" style={{ minWidth: 60 }}>
        {type}
      </span>
      <span>{note}</span>
    </div>
  );
}

const REJECTION_REASONS: { reason: string; meaning: string }[] = [
  {
    reason: "missing signature",
    meaning: "No x-signature header was sent.",
  },
  {
    reason: "missing timestamp",
    meaning: "No x-timestamp header was sent.",
  },
  {
    reason: "malformed timestamp",
    meaning: "x-timestamp wasn't a plain number of seconds.",
  },
  {
    reason: "timestamp outside the accepted window",
    meaning:
      "x-timestamp was more than 5 minutes off from our clock. Postbacks must be sent close to real time, not queued and replayed later.",
  },
  {
    reason: "signature does not match",
    meaning:
      "The HMAC didn't match. Almost always the wrong secret, or the canonical string built in a different order/format than below.",
  },
  {
    reason: "partner has no webhook secret",
    meaning:
      "Your Integration Method isn't set to Webhook or Postback URL yet, so no secret has been generated.",
  },
];

/** The Integration Guide tab on a partner. Staff see any partner's; a partner their own. */
export async function PartnerIntegrationGuideView(
  props: DocumentViewServerProps
): Promise<ReactNode> {
  const { req, docID } = props.initPageResult;
  const scope = scopeOfRequest(req);
  if (!scope) {
    return <Denied />;
  }

  const id = String(docID ?? props.doc?.id ?? "");
  const partner = await req.payload.findByID({
    collection: "partners",
    id,
    depth: 0,
    req,
    overrideAccess: false,
  });

  const webhookUrl = partner?.webhookUrl ?? null;
  const hasWebhookIntegration =
    partner?.integrationMethod === "webhook" ||
    partner?.integrationMethod === "postback";

  return (
    <>
      <Styles />
      <div className="ana ana-page">
        <div className="ana-head">
          <div>
            <h2>Integration Guide</h2>
            <div className="ana-muted">
              How to confirm a conversion once a reader completes your offer.
            </div>
          </div>
        </div>

        <Panel title="How it works">
          <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>
              A reader taps your offer in the app and is redirected to you,
              carrying a <code>clickId</code> in the URL.
            </li>
            <li>
              They complete the action (install, purchase, sign-up — whatever
              your offer requires).
            </li>
            <li>
              Your system calls the webhook below with that <code>clickId</code>{" "}
              and the outcome.
            </li>
            <li>
              We verify the request came from you (see Authentication below),
              then credit the reader's points.
            </li>
          </ol>
        </Panel>

        <Panel
          hint={
            hasWebhookIntegration
              ? "Give this to your technical contact."
              : "Set Integration Method to Webhook or Postback URL on this partner to get a URL."
          }
          title="Your webhook URL"
        >
          {webhookUrl ? (
            <Code>{webhookUrl}</Code>
          ) : (
            <div className="ana-empty">No webhook URL yet.</div>
          )}
        </Panel>

        <Panel
          hint="POST a JSON body with these fields."
          title="Request format"
        >
          <div style={{ display: "grid", gap: 8 }}>
            <Field
              name="clickId"
              note="The clickId you received in the redirect."
              type="string, required"
            />
            <Field
              name="status"
              note={'"success" or "failed".'}
              type='"success" | "failed", required'
            />
            <Field
              name="partnerOrderId"
              note="Your own order/transaction reference, for your records."
              type="string, optional"
            />
            <Field
              name="metadata"
              note="Any extra string key/value pairs you want attached."
              type="object, optional"
            />
          </div>
        </Panel>

        <Panel
          hint="Every request must be signed, or it is refused before anything is read from it."
          title="Authentication"
        >
          <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
            <p style={{ margin: 0 }}>
              Send two headers: <code>x-signature</code> and{" "}
              <code>x-timestamp</code> (Unix seconds). Build the signature as:
            </p>
            <Code>{`signature = HMAC_SHA256(
  secret,
  \`\${timestamp}:\${clickId}:\${status}\`
).toString('hex')`}</Code>
            <p style={{ margin: 0 }}>
              <code>secret</code> is the Webhook Secret shown in the CPA
              Integration section on this partner's record — a credential, so
              treat it that way: it isn't repeated here, and it should reach
              your technical contact out of band, not over email in plain text.
            </p>
            <p className="ana-muted" style={{ margin: 0 }}>
              The timestamp must be within 5 minutes of our clock, so a queued
              or replayed request is rejected even with a correct signature.
            </p>
            <p className="ana-muted" style={{ margin: 0 }}>
              A Node.js example:
            </p>
            <Code>{`const crypto = require('crypto');

const timestamp = String(Math.floor(Date.now() / 1000));
const canonical = \`\${timestamp}:\${clickId}:\${status}\`;
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(canonical, 'utf-8')
  .digest('hex');

await fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-signature': signature,
    'x-timestamp': timestamp,
  },
  body: JSON.stringify({ clickId, status }),
});`}</Code>
          </div>
        </Panel>

        <Panel
          hint="Prove your signing code is correct before it settles a real conversion."
          title="Testing before you go live"
        >
          <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
            <p style={{ margin: 0 }}>
              Add <code>{`"dryRun": true`}</code> to the request body. A
              correctly signed dry run gets back confirmation that the signature
              checked out — nothing is settled, no points are awarded, and it
              doesn't count toward this partner's postback history.
            </p>
            <p className="ana-muted" style={{ margin: 0 }}>
              You'll need a real <code>clickId</code> to test against — open one
              of your own offers in the app to mint one.
            </p>
            <Code>{`{ "clickId": "clk_...", "status": "success", "dryRun": true }`}</Code>
          </div>
        </Panel>

        <Panel
          hint="If a postback is being rejected, this is our own verification's reason — never shown to the caller, only logged and recorded here."
          title="Common rejection reasons"
        >
          <div style={{ display: "grid", gap: 8 }}>
            {REJECTION_REASONS.map((r) => (
              <div key={r.reason} style={{ fontSize: 13 }}>
                <code>{r.reason}</code>
                <div className="ana-muted">{r.meaning}</div>
              </div>
            ))}
          </div>
          {hasWebhookIntegration ? (
            <div className="ana-muted" style={{ fontSize: 12 }}>
              See the{" "}
              <a href={`${ADMIN_PATH}/collections/partners/${id}/performance`}>
                Performance tab
              </a>{" "}
              for this partner's actual postback health.
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
