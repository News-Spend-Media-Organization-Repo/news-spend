import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { partnerContentGuideView } from "../src/components/PartnerContentGuide/tabs";
import { PartnerContentGuideView } from "../src/components/PartnerContentGuide/views";
import { entries } from "../src/components/WhatsNew/entries";
import {
  ENGAGEMENT_PLACEMENTS,
  OFFER_PLACEMENTS,
} from "../src/lib/earnPlacements";

const staff = { collection: "admins", role: "editor" };
const partnerUser = {
  collection: "admins",
  role: "partner",
  partner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

type Item = Record<string, unknown>;

function propsFor(user: unknown, item: Item, partner: Item = {}) {
  const findByID = ({ collection }: { collection: string }) =>
    Promise.resolve(collection === "partners" ? partner : item);
  return {
    initPageResult: {
      docID: "item-1",
      req: { user, payload: { findByID } },
    },
    doc: item,
  } as never;
}

const html = (node: unknown) => renderToStaticMarkup(node as never);

const baseItem: Item = {
  id: "item-1",
  type: "book",
  status: "active",
  placements: ["news-click-ads", "points-mall-apps", "connect-brand-video"],
  points: 25,
  adCopy: "A new thriller",
  condition: "Install, earn 25 points",
  partner: "p1",
};

describe("partner content guide tab", () => {
  it("is a Guide tab at /guide shown to staff only", () => {
    expect(partnerContentGuideView.path).toBe("/guide");
    expect(partnerContentGuideView.tab.label).toBe("Guide");
    const cond = partnerContentGuideView.tab.condition;
    expect(cond({ req: { user: staff } } as never)).toBe(true);
    expect(cond({ req: { user: partnerUser } } as never)).toBe(false);
    expect(cond({ req: { user: null } } as never)).toBe(false);
  });

  it("denies a partner-scope request", async () => {
    const out = html(
      await PartnerContentGuideView(propsFor(partnerUser, baseItem))
    );
    expect(out).toContain("No access");
    expect(out).not.toContain("A new thriller");
  });

  it("shows ad, offer and boost lines per placement", async () => {
    const out = html(
      await PartnerContentGuideView(
        propsFor(staff, baseItem, {
          confirmationDays: 14,
          webhookSecret: "s3cr3t",
        })
      )
    );
    expect(out).toContain("Ad: shows A new thriller, never pays.");
    expect(out).toContain(
      "Offer: shows Install, earn 25 points and 25 points."
    );
    expect(out).toContain(
      "Boost: paid when the ad is watched, through the giveaway Boost, not by tapping."
    );
    expect(out).toContain("14");
    expect(out).not.toContain("s3cr3t");
  });

  it("says when ad copy is missing", async () => {
    const out = html(
      await PartnerContentGuideView(
        propsFor(staff, { ...baseItem, adCopy: "" })
      )
    );
    expect(out).toContain("no ad copy yet");
  });

  it("lists exactly the earn placements in the surface table", async () => {
    const out = html(await PartnerContentGuideView(propsFor(staff, baseItem)));
    const table = out.slice(out.indexOf('data-testid="surface-table"'));
    const rows = [...table.matchAll(/data-surface="([^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(rows).toEqual([...OFFER_PLACEMENTS, ...ENGAGEMENT_PLACEMENTS]);
  });

  it("renders the checklist with failing marks", async () => {
    const out = html(
      await PartnerContentGuideView(
        propsFor(staff, {
          ...baseItem,
          placements: ["news-click-ads"],
          adCopy: "",
        })
      )
    );
    expect(out).toContain(
      "Points are set but no offer placement is selected; users will not be paid."
    );
    expect(out).toContain('data-check="missing-ad-copy" data-ok="false"');
  });

  it("shows a note instead of the checklist for promo-media", async () => {
    const out = html(
      await PartnerContentGuideView(
        propsFor(staff, { ...baseItem, type: "promo-media", placements: null })
      )
    );
    expect(out).toContain("Promo media items");
    expect(out).not.toContain("data-check=");
  });

  it("explains how partners see performance, staff only", async () => {
    const out = html(await PartnerContentGuideView(propsFor(staff, baseItem)));
    expect(out).toContain("How partners see performance");
    expect(out).toContain("impressions");
    expect(out).toContain("taps");
    expect(out).toContain("tap-through");
    expect(out).toContain("reported by the app");
    expect(out).toContain("related-news card");
    expect(out).toContain("banners inside articles");
    expect(out).toContain("Discover lists");
    expect(out).toContain("clicks sent to the partner");

    const denied = html(
      await PartnerContentGuideView(propsFor(partnerUser, baseItem))
    );
    expect(denied).not.toContain("How partners see performance");
  });

  it("has a What's new entry for partner performance", () => {
    const entry = entries.find(
      (e) => e.id === "2026-10-21-partner-performance"
    );
    expect(entry?.date).toBe("2026-10-21");
    const changed = entry?.sections.find((s) => s.heading === "Changed");
    expect(changed?.items.join(" ")).toContain("article impressions");
  });
});
