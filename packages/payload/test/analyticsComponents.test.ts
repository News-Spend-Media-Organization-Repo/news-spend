import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PgDialect } from "@payloadcms/db-postgres/drizzle/pg-core";
import { renderToStaticMarkup } from "react-dom/server";

import * as components from "../src/components/Analytics";
import {
  analyticsDefaultLayout,
  analyticsWidgets,
} from "../src/components/Analytics/layout";
import { parseAnalyticsParams } from "../src/components/Analytics/params";
import {
  analyticsNavLink,
  analyticsPageView,
  articleStatsView,
  giveawayStatsView,
  partnerPerformanceView,
} from "../src/components/Analytics/tabs";

const PARTNER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARTNER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ARTICLE = "11111111-1111-4111-8111-111111111111";

const staff = { collection: "admins", role: "editor" };
const partnerA = { collection: "admins", role: "partner", partner: PARTNER_A };
const unassignedPartner = { collection: "admins", role: "partner" };
const appUser = { collection: "users", role: "super-admin" };

/** A request whose database records what it is asked. */
function requestFor(user: unknown) {
  const dialect = new PgDialect();
  const queries: { sql: string; params: unknown[] }[] = [];
  const req = {
    user,
    payload: {
      db: {
        drizzle: {
          execute: (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
            const compiled = dialect.sqlToQuery(query);
            queries.push({ sql: compiled.sql, params: compiled.params });
            return Promise.resolve({ rows: [] });
          },
        },
      },
    },
  };
  return { req: req as never, queries };
}

const html = (node: unknown) => renderToStaticMarkup(node as never);
const NO_ACCESS = "No access";
const ISO_DATE = /^\d{4}-\d\d-\d\d$/;

describe("parseAnalyticsParams", () => {
  it("accepts the offered periods and platforms", () => {
    expect(parseAnalyticsParams({ days: "7", platform: "ios" })).toEqual({
      days: 7,
      platform: "ios",
    });
  });

  it("falls back for anything else, since a query string is user input", () => {
    expect(parseAnalyticsParams({ days: "999", platform: "symbian" })).toEqual({
      days: 30,
      platform: undefined,
    });
    expect(parseAnalyticsParams({ days: "1; DROP TABLE x" }).days).toBe(30);
    expect(parseAnalyticsParams(undefined)).toEqual({
      days: 30,
      platform: undefined,
    });
  });

  it("takes the first when a parameter is repeated", () => {
    expect(parseAnalyticsParams({ days: ["90", "7"] }).days).toBe(90);
  });
});

describe("the default home layout", () => {
  const layoutFor = (user: unknown) =>
    analyticsDefaultLayout({ req: { user } as never }).map((w) => w.widgetSlug);

  it("gives staff the newsroom overview", () => {
    const slugs = layoutFor(staff);

    expect(slugs).toContain("analytics-funnel");
    expect(slugs).toContain("analytics-top-articles");
    expect(slugs).toContain("analytics-audience-kpi");
    expect(slugs).toContain("analytics-audience-growth");
    expect(slugs).toContain("analytics-devices");
    expect(slugs).toContain("collections");
  });

  it("gives a partner their own performance and nothing else", () => {
    expect(layoutFor(partnerA)).toEqual(["analytics-partner-performance"]);
  });

  it("gives an unfinished partner account, an app user and nobody an empty page", () => {
    expect(layoutFor(unassignedPartner)).toEqual([]);
    expect(layoutFor(appUser)).toEqual([]);
    expect(layoutFor(null)).toEqual([]);
  });

  it("only refers to widgets that exist", () => {
    const registered = new Set([
      ...analyticsWidgets.map((w) => w.slug),
      "collections",
    ]);
    for (const user of [staff, partnerA]) {
      for (const slug of layoutFor(user)) {
        expect(registered.has(slug)).toBe(true);
      }
    }
  });
});

describe("tabs", () => {
  const args = (user: unknown) => ({ req: { user } as never }) as never;
  const showsStats = (user: unknown) =>
    articleStatsView.tab.condition(args(user));
  const showsPerformance = (user: unknown) =>
    partnerPerformanceView.tab.condition(args(user));

  it("shows an article's Stats tab to staff only", () => {
    expect(showsStats(staff)).toBe(true);
    expect(showsStats(partnerA)).toBe(false);
    expect(showsStats(appUser)).toBe(false);
    expect(showsStats(null)).toBe(false);
  });

  it("shows a partner's Performance tab to staff and to a partner, not to others", () => {
    expect(showsPerformance(staff)).toBe(true);
    expect(showsPerformance(partnerA)).toBe(true);
    expect(showsPerformance(unassignedPartner)).toBe(false);
    expect(showsPerformance(appUser)).toBe(false);
  });

  it("shows a giveaway's Stats tab to staff only", () => {
    const shows = (user: unknown) =>
      giveawayStatsView.tab.condition(args(user));

    expect(shows(staff)).toBe(true);
    expect(shows(partnerA)).toBe(false);
    expect(shows(appUser)).toBe(false);
    expect(shows(null)).toBe(false);
  });
});

describe("a screen refuses a viewer it is not for, whatever the address", () => {
  const docProps = (user: unknown, docID: string) => {
    const { req, queries } = requestFor(user);
    return {
      props: {
        initPageResult: { req, docID },
        searchParams: {},
        doc: { id: docID },
      } as never,
      queries,
    };
  };

  it("won't show an article's stats to a partner, and won't query", async () => {
    const { props, queries } = docProps(partnerA, ARTICLE);

    const out = html(await components.ArticleStatsView(props));

    expect(out).toContain(NO_ACCESS);
    expect(queries).toHaveLength(0);
  });

  it("won't show a giveaway's stats to a partner, and won't query", async () => {
    const { props, queries } = docProps(
      partnerA,
      "22222222-2222-4222-8222-222222222222"
    );

    const out = html(await components.GiveawayStatsView(props));

    expect(out).toContain(NO_ACCESS);
    expect(queries).toHaveLength(0);
  });

  it("shows staff a giveaway's stats", async () => {
    const { props, queries } = docProps(
      staff,
      "22222222-2222-4222-8222-222222222222"
    );

    const out = html(await components.GiveawayStatsView(props));

    expect(out).not.toContain(NO_ACCESS);
    expect(out).toContain("Giveaway stats");
    expect(queries.length).toBeGreaterThan(0);
  });

  it("won't show the analytics page to a partner or anyone signed out", async () => {
    for (const user of [partnerA, appUser, null]) {
      const { req, queries } = requestFor(user);

      const out = html(
        await components.AnalyticsPageView({
          initPageResult: { req },
          searchParams: {},
        } as never)
      );

      expect(out).toContain(NO_ACCESS);
      expect(queries).toHaveLength(0);
    }
  });

  it("shows staff an article's stats", async () => {
    const { props, queries } = docProps(staff, ARTICLE);

    const out = html(await components.ArticleStatsView(props));

    expect(out).not.toContain(NO_ACCESS);
    expect(out).toContain("Article stats");
    expect(queries.length).toBeGreaterThan(0);
  });

  it("explains a malformed article id instead of failing", async () => {
    const { props, queries } = docProps(staff, "not-a-uuid");

    const out = html(await components.ArticleStatsView(props));

    expect(out).toContain("Can&#x27;t show this report");
    expect(queries).toHaveLength(0);
  });

  it("limits a partner's Performance tab to their own partner", async () => {
    const { props, queries } = docProps(partnerA, PARTNER_A);

    const out = html(await components.PartnerPerformanceView(props));

    expect(out).toContain("Performance");
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.params).toContain(PARTNER_A);
    }
  });

  it("shows a partner how their postbacks are being received, and says so when none have arrived", async () => {
    const { props, queries } = docProps(partnerA, PARTNER_A);

    const out = html(await components.PartnerPerformanceView(props));

    expect(out).toContain("Postbacks");
    expect(out).toContain("No postback has been received yet");
    const postbackQueries = queries.filter((q) =>
      q.sql.includes("partner_postbacks")
    );
    expect(postbackQueries.length).toBeGreaterThan(0);
    for (const q of postbackQueries) {
      expect(q.params).toContain(PARTNER_A);
    }
  });

  it("refuses a partner who opens another partner's Performance address", async () => {
    const { props, queries } = docProps(partnerA, PARTNER_B);

    const out = html(await components.PartnerPerformanceView(props));

    expect(out).toContain(NO_ACCESS);
    expect(queries).toHaveLength(0);
  });

  it("refuses a partner account with no partner assigned", async () => {
    const { props, queries } = docProps(unassignedPartner, PARTNER_A);

    const out = html(await components.PartnerPerformanceView(props));

    expect(out).toContain(NO_ACCESS);
    expect(queries).toHaveLength(0);
  });
});

describe("a widget added by hand shows nothing it should not", () => {
  const widgetProps = (user: unknown, data: Record<string, unknown> = {}) => {
    const { req, queries } = requestFor(user);
    return {
      props: { req, user, widgetData: data, widgetSlug: "x" } as never,
      queries,
    };
  };

  const staffOnly = [
    ["KpiWidget", components.KpiWidget],
    ["FunnelWidget", components.FunnelWidget],
    ["TopArticlesWidget", components.TopArticlesWidget],
    ["SurfacesWidget", components.SurfacesWidget],
    ["CategoriesWidget", components.CategoriesWidget],
    ["AudienceKpiWidget", components.AudienceKpiWidget],
    ["GrowthWidget", components.GrowthWidget],
    ["DevicesWidget", components.DevicesWidget],
    ["CountriesWidget", components.CountriesWidget],
    ["FeedbackWidget", components.FeedbackWidget],
    ["AttentionWidget", components.AttentionWidget],
    ["PushWidget", components.PushWidget],
  ] as const;

  it.each(
    staffOnly
  )("%s shows a partner 'no access' without querying", async (_name, Widget) => {
    const { props, queries } = widgetProps(partnerA);

    expect(html(await Widget(props))).toContain(NO_ACCESS);
    expect(queries).toHaveLength(0);
  });

  it.each(staffOnly)("%s works for staff", async (_name, Widget) => {
    const { props, queries } = widgetProps(staff);

    expect(html(await Widget(props))).not.toContain(NO_ACCESS);
    expect(queries.length).toBeGreaterThan(0);
  });

  it("gives a partner only their own numbers in the partner widget", async () => {
    const { props, queries } = widgetProps(partnerA);

    const out = html(await components.PartnerPerformanceWidget(props));

    expect(out).not.toContain(NO_ACCESS);
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.params).toContain(PARTNER_A);
    }
  });

  it("shows nothing to an unfinished partner account or an app user", async () => {
    for (const user of [unassignedPartner, appUser]) {
      const { props, queries } = widgetProps(user);

      expect(html(await components.PartnerPerformanceWidget(props))).toContain(
        NO_ACCESS
      );
      expect(queries).toHaveLength(0);
    }
  });

  it("ignores a period that is not one of the choices", async () => {
    const { props, queries } = widgetProps(staff, {
      metric: "views",
      days: "36500",
    });

    await components.KpiWidget(props);

    // Falls back to 30 days: two windows of 30 days, not 36,500.
    const dates = queries.flatMap((q) =>
      q.params.filter((p) => typeof p === "string" && ISO_DATE.test(p))
    ) as string[];
    const spanDays =
      (Date.parse(dates.at(-1) ?? "") - Date.parse(dates[0] ?? "")) /
      86_400_000;
    expect(spanDays).toBeLessThan(120);
  });
});

describe("the nav link", () => {
  it("is for staff only", () => {
    expect(
      components.AnalyticsNavLink({ user: staff } as never)
    ).not.toBeNull();
    expect(components.AnalyticsNavLink({ user: partnerA } as never)).toBeNull();
    expect(
      components.AnalyticsNavLink({ user: undefined } as never)
    ).toBeNull();
  });
});

describe("registration", () => {
  const importMap = readFileSync(
    path.resolve(
      import.meta.dir,
      "../../../apps/cms/src/app/(payload)/admin/importMap.js"
    ),
    "utf8"
  );

  const referenced = [
    ...analyticsWidgets.map((w) => w.Component),
    articleStatsView.Component,
    partnerPerformanceView.Component,
    giveawayStatsView.Component,
    analyticsPageView.Component,
    analyticsNavLink,
  ] as string[];

  it.each(referenced)("%s is exported and in the import map", (ref) => {
    const [, name] = ref.split("#");
    expect(Object.keys(components)).toContain(name);
    // Forgetting `generate:importmap` is a blank panel in production.
    expect(importMap).toContain(`"${ref}"`);
  });

  it("gives every widget a permanent, unique slug", () => {
    const slugs = analyticsWidgets.map((w) => w.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
