import type { DocumentViewServerProps } from "payload";
import type { ReactNode } from "react";

import { isStaff } from "../../access/adminRoles";
import {
  ENGAGEMENT_PLACEMENTS,
  isOfferPlacement,
  OFFER_PLACEMENTS,
} from "../../lib/earnPlacements";
import { partnerContentChecklist } from "../../lib/partnerContentChecklist";
import { Denied, Panel, Styles } from "../Analytics/ui";

/**
 * Staff guide for one partner-content item: what each of its placements shows
 * users, the rules for ad copy versus offer copy, and a pass/fail checklist.
 * Never renders the partner's webhook secret.
 */

const SURFACE_NOTES: Record<string, string> = {
  "points-mall-books":
    "Discover, books. Pays on tap for click-award partners, otherwise after the partner confirms.",
  "points-mall-apps":
    "Discover, apps. Pays on tap for click-award partners, otherwise after the partner confirms.",
  "lucky-app-wall":
    "Lucky App Wall. Pays on tap for click-award partners, otherwise after the partner confirms.",
  "connect-brand-video": "Boost video. Pays when the ad is watched.",
  "connect-brands-tab": "Boost brands tab. Pays when the ad is watched.",
};

type Doc = {
  type?: string | null;
  status?: string | null;
  placements?: string[] | null;
  points?: number | null;
  adCopy?: string | null;
  condition?: string | null;
  partner?: unknown;
};

type PartnerDoc = {
  confirmationDays?: number | null;
  awardOnClick?: boolean | null;
  integrationMethod?: string | null;
};

const idOf = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object" && value !== null && "id" in value) {
    return String((value as { id: unknown }).id);
  }
  return null;
};

function placementLine(placement: string, doc: Doc): string {
  if (isOfferPlacement(placement)) {
    return `Offer: shows ${doc.condition?.trim() || "no offer copy yet"} and ${doc.points ?? 0} points.`;
  }
  if ((ENGAGEMENT_PLACEMENTS as readonly string[]).includes(placement)) {
    return "Boost: paid when the ad is watched, through the giveaway Boost, not by tapping.";
  }
  return `Ad: shows ${doc.adCopy?.trim() || "no ad copy yet"}, never pays.`;
}

function Block({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Panel title={title}>
      <div style={{ display: "grid", gap: 8, fontSize: 13 }}>{children}</div>
    </Panel>
  );
}

export async function PartnerContentGuideView(
  props: DocumentViewServerProps
): Promise<ReactNode> {
  const { req, docID } = props.initPageResult;
  if (!isStaff({ req })) {
    return <Denied />;
  }

  const id = String(docID ?? props.doc?.id ?? "");
  const item = (await req.payload.findByID({
    collection: "partner-content",
    id,
    depth: 0,
    disableErrors: true,
    req,
  })) as Doc | null;
  const doc: Doc = item ?? {};

  const partnerId = idOf(doc.partner);
  const partner = partnerId
    ? ((await req.payload.findByID({
        collection: "partners",
        id: partnerId,
        depth: 0,
        disableErrors: true,
        req,
      })) as PartnerDoc | null)
    : null;
  const confirmationDays = partner?.confirmationDays ?? 7;
  const isPromoMedia = doc.type === "promo-media";
  const placements = doc.placements ?? [];

  return (
    <>
      <Styles />
      <div className="ana ana-page">
        <div className="ana-head">
          <div>
            <h2>Guide</h2>
            <div className="ana-muted">
              How this item behaves as an ad and as an offer.
            </div>
          </div>
        </div>

        {isPromoMedia ? (
          <Panel title="This item">
            <div className="ana-empty">
              Promo media items use their own items list and have no placements,
              so the ad and offer checks do not apply.
            </div>
          </Panel>
        ) : (
          <>
            <Panel
              hint="What users see on each placement of this item."
              title="Live for this item"
            >
              {placements.length === 0 ? (
                <div className="ana-empty">No placements selected.</div>
              ) : (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  {placements.map((placement) => (
                    <li key={placement}>
                      <code>{placement}</code>: {placementLine(placement, doc)}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Checklist">
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 0,
                  listStyle: "none",
                  display: "grid",
                  gap: 6,
                }}
              >
                {partnerContentChecklist(doc).map((check) => (
                  <li
                    data-check={check.key}
                    data-ok={String(check.ok)}
                    key={check.key}
                  >
                    {check.ok ? "Pass" : "Fix"}: {check.message}
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        )}

        <Panel
          hint="Only these placements can pay. Every other placement is an ad."
          title="Where users are paid"
        >
          <table
            data-testid="surface-table"
            style={{ width: "100%", fontSize: 13 }}
          >
            <thead>
              <tr>
                <th align="left">Placement</th>
                <th align="left">What happens</th>
              </tr>
            </thead>
            <tbody>
              {[...OFFER_PLACEMENTS, ...ENGAGEMENT_PLACEMENTS].map(
                (surface) => (
                  <tr data-surface={surface} key={surface}>
                    <td>
                      <code>{surface}</code>
                    </td>
                    <td>{SURFACE_NOTES[surface] ?? ""}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </Panel>

        <Block title="1. Ad versus offer">
          <p style={{ margin: 0 }}>
            One item can be both. On Discover and Lucky App Wall it is an offer:
            it shows the offer copy and pays points. On every other placement it
            is an ad: it shows the ad copy and never pays.
          </p>
        </Block>

        <Block title="2. Which text goes where">
          <p style={{ margin: 0 }}>
            <b>Ad copy</b> is plain text about the product. <b>Offer copy</b> is
            the reward promise and is only shown on offer placements.
          </p>
          <p style={{ margin: 0 }}>
            Good ad copy: "A thriller set in Lagos". Bad ad copy: "Install and
            earn 30 points" (a reward on a surface that cannot pay it).
          </p>
          <p style={{ margin: 0 }}>
            Good offer copy: "Install the app, earn 30 points". Bad offer copy:
            "Great book" (it promises nothing, so users do not know what to do).
          </p>
        </Block>

        <Block title="3. Before activating">
          <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Fill in the ad copy.</li>
            <li>Pick the placements.</li>
            <li>Set points only if an offer placement is selected.</li>
            <li>
              Check the partner's integration method: webhook, or award on
              click.
            </li>
          </ol>
        </Block>

        <Block title="4. When users are paid">
          <p style={{ margin: 0 }}>
            If the partner counts a click as a completed conversion, points are
            paid the moment the user taps. Otherwise points are paid after the
            partner confirms the conversion by webhook.
          </p>
          <p style={{ margin: 0 }}>
            Until then the user sees "Pending: waiting for the partner to
            confirm, usually within {confirmationDays} days" in Activities (
            {confirmationDays} days is this partner's confirmation window).
            After that it shows "Not confirmed" and tells the user to contact
            support if they completed it. No points are paid until the partner
            confirms.
          </p>
        </Block>

        <Block title="5. Completed offers">
          <p style={{ margin: 0 }}>
            An offer disappears from a user's lists once they have completed it.
            When a user has completed everything, the list says "You've
            completed all available offers. New ones are added regularly."
          </p>
        </Block>

        <Block title="6. Common mistakes">
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Reward wording in the ad copy.</li>
            <li>Points set with no offer placement selected.</li>
            <li>An offer placed only on ad placements, so it never pays.</li>
          </ul>
        </Block>
      </div>
    </>
  );
}
