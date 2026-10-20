import { describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PgDialect } from "@payloadcms/db-postgres/drizzle/pg-core";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LargeGrantsPanel,
  LeaderboardPanel,
  NeedsAttentionPanel,
  PointsKpis,
  StepsPanel,
} from "../src/components/Analytics/blocks";
import {
  analyticsDefaultLayout,
  analyticsWidgets,
} from "../src/components/Analytics/layout";
import { parseAnalyticsParams } from "../src/components/Analytics/params";
import {
  analyticsNavLink,
  analyticsPageView,
  analyticsViews,
  articleStatsView,
  giveawayStatsView,
  partnerPerformanceView,
  pointsPageView,
  retentionPageView,
} from "../src/components/Analytics/tabs";
import { DefaultTemplateStub, templateCalls } from "./analyticsTemplateStub";

mock.module("@payloadcms/next/templates", () => ({
  DefaultTemplate: DefaultTemplateStub,
}));
const components = await import("../src/components/Analytics");

const PARTNER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARTNER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ARTICLE = "11111111-1111-4111-8111-111111111111";

const staff = { collection: "admins", role: "editor" };
const partnerA = { collection: "admins", role: "partner", partner: PARTNER_A };
const unassignedPartner = { collection: "admins", role: "partner" };
const appUser = { collection: "users", role: "super-admin" };

/** A request whose database records what it is asked. */
function requestFor(
  user: unknown,
  rowsFor: (sql: string) => unknown[] = () => []
) {
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
            return Promise.resolve({ rows: rowsFor(compiled.sql) });
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
const STYLE_BLOCK = /<style>[\s\S]*?<\/style>/g;

describe("parseAnalyticsParams", () => {
  it("accepts the offered periods and platforms", () => {
    expect(parseAnalyticsParams({ days: "7", platform: "ios" })).toEqual({
      days: 7,
      platform: "ios",
      sort: "readers",
    });
  });

  it("falls back for anything else, since a query string is user input", () => {
    expect(parseAnalyticsParams({ days: "999", platform: "symbian" })).toEqual({
      days: 30,
      platform: undefined,
      sort: "readers",
    });
    expect(parseAnalyticsParams({ days: "1; DROP TABLE x" }).days).toBe(30);
    expect(parseAnalyticsParams(undefined)).toEqual({
      days: 30,
      platform: undefined,
      sort: "readers",
    });
  });

  it("ranks by unique readers unless one of the offered sorts is asked for", () => {
    expect(parseAnalyticsParams({}).sort).toBe("readers");
    expect(parseAnalyticsParams({ sort: "rising" }).sort).toBe("rising");
    expect(parseAnalyticsParams({ sort: "1; DROP TABLE news" }).sort).toBe(
      "readers"
    );
    expect(parseAnalyticsParams({ sort: ["reads", "views"] }).sort).toBe(
      "reads"
    );
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
      // Registered by Payload and by the contact-export widget's own module.
      "collections",
      "contact-export",
    ]);
    for (const user of [staff, partnerA]) {
      for (const slug of layoutFor(user)) {
        expect(registered.has(slug)).toBe(true);
      }
    }
  });
});

describe("the impression-to-read steps", () => {
  it("shows direct opens beside views, not a click-through the bar does not measure", () => {
    const out = html(
      StepsPanel({
        current: {
          impressions: 1960,
          views: 1119,
          matchedViews: 197,
          directOpens: 922,
          exposures: 1500,
          clickedExposures: 152,
          reads: 300,
          ctr: 10.1,
          readRate: 26.8,
        } as never,
      })
    );

    expect(out).toContain("922 direct");
    expect(out).not.toContain("10.1%");
  });
});

describe("the Top articles widget settings", () => {
  it("offers every sort, defaulting to unique readers, so saved layouts keep working", () => {
    const widget = analyticsWidgets.find(
      (w) => w.slug === "analytics-top-articles"
    );
    const field = (widget?.fields ?? []).find(
      (f) => "name" in f && f.name === "sort"
    );

    expect(field).toMatchObject({ type: "select", defaultValue: "readers" });
    expect(
      (field as { options: { value: string }[] }).options.map((o) => o.value)
    ).toEqual(["readers", "reads", "views", "impressions", "rising"]);
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

  it("says what the top articles are ranked by, and offers the other sorts", async () => {
    const page = async (searchParams: Record<string, string>) => {
      const { req } = requestFor(staff);
      return html(
        await components.AnalyticsPageView({
          initPageResult: { req },
          searchParams,
        } as never)
      );
    };

    const byDefault = await page({});
    const rising = await page({ sort: "rising", days: "7", platform: "ios" });

    expect(byDefault).toContain("By unique readers, last 30 days");
    expect(rising).toContain("By rising, last 7 days");
    // The sort links keep the period and platform that were chosen.
    expect(rising).toContain("sort=reads");
    expect(rising).toContain("days=7");
    expect(rising).toContain("platform=ios");
    expect(byDefault).toContain("Direct opens");
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

  it("ranks the Top articles widget by readers when its saved settings have no sort or a bad one", async () => {
    for (const data of [{ days: "30" }, { days: "30", sort: "nonsense" }]) {
      const { props, queries } = widgetProps(staff, data);

      const out = html(await components.TopArticlesWidget(props));

      expect(out).toContain("By unique readers, last 30 days");
      expect(queries.length).toBeGreaterThan(0);
    }
    const { props } = widgetProps(staff, { days: "7", sort: "views" });
    expect(html(await components.TopArticlesWidget(props))).toContain(
      "By views, last 7 days"
    );
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

describe("the admin template", () => {
  const PERMISSIONS = { canAccessAdmin: true };
  const VISIBLE = {
    collections: { news: true },
    globals: { "site-settings": true },
  };

  const pageProps = (
    user: unknown,
    searchParams: Record<string, string> = {}
  ) => {
    const { req } = requestFor(user);
    return {
      initPageResult: {
        req,
        locale: "en",
        permissions: PERMISSIONS,
        visibleEntities: VISIBLE,
      },
      params: { segments: ["analytics"] },
      searchParams,
    } as never;
  };

  it("wraps all three full-page views in the default template", async () => {
    for (const View of [
      components.AnalyticsPageView,
      components.PointsPageView,
      components.RetentionPageView,
    ]) {
      templateCalls.length = 0;
      const out = html(await View(pageProps(staff)));

      expect(out).toContain('data-template="default"');
      expect(templateCalls).toHaveLength(1);
    }
  });

  it("wraps their No access screens too", async () => {
    for (const View of [
      components.AnalyticsPageView,
      components.PointsPageView,
      components.RetentionPageView,
    ]) {
      templateCalls.length = 0;
      const out = html(await View(pageProps(partnerA)));

      expect(out).toContain('data-template="default"');
      expect(out).toContain(NO_ACCESS);
      expect(templateCalls).toHaveLength(1);
    }
  });

  it("does not wrap the document-level Stats tabs", async () => {
    const { req } = requestFor(staff);
    const props = {
      initPageResult: { req, docID: ARTICLE },
      searchParams: {},
      doc: { id: ARTICLE },
    } as never;

    for (const View of [
      components.ArticleStatsView,
      components.PartnerPerformanceView,
      components.GiveawayStatsView,
    ]) {
      templateCalls.length = 0;
      const out = html(await View(props));

      expect(out).not.toContain('data-template="default"');
      expect(templateCalls).toHaveLength(0);
    }
  });

  it("hands the template the user, permissions and plain visible entities", async () => {
    const out = html(await components.AnalyticsPageView(pageProps(staff)));

    expect(out).toContain('data-template="default"');
    const last = templateCalls.at(-1);
    expect(last?.user).toBe(staff);
    expect(last?.permissions).toBe(PERMISSIONS);
    expect(last?.visibleEntities).not.toBe(VISIBLE);
    expect(last?.visibleEntities).toEqual({
      collections: VISIBLE.collections,
      globals: VISIBLE.globals,
    });
  });
});

describe("the Points page", () => {
  const POINTS_USER_A = "33333333-3333-4333-8333-333333333333";
  const POINTS_USER_B = "44444444-4444-4444-8444-444444444444";

  const page = async (user: unknown, rowsFor?: (sql: string) => unknown[]) => {
    const { req, queries } = requestFor(user, rowsFor);
    return {
      out: html(
        await components.PointsPageView({
          initPageResult: { req },
          searchParams: {},
        } as never)
      ),
      queries,
    };
  };

  it("gives staff every figure and both empty states when the ledger is empty", async () => {
    const { out, queries } = await page(staff);

    for (const label of [
      "Issued",
      "Spent",
      "Net",
      "Outstanding",
      "Active earners",
      "Large grants",
    ]) {
      expect(out).toContain(label);
    }
    expect(out).toContain("No single grant above 5,000 points in this period.");
    expect(out).toContain("No one earned points from activity in this period.");
    expect(queries.length).toBeGreaterThan(0);
  });

  it("refuses a partner, an app user and a signed-out viewer without querying", async () => {
    for (const user of [partnerA, appUser, null]) {
      const { out, queries } = await page(user);

      expect(out).toContain(NO_ACCESS);
      expect(queries).toHaveLength(0);
    }
  });

  it("links every account to its admin record without printing a name or an email", async () => {
    const rowsFor = (sql: string) =>
      sql.includes("ROW_NUMBER() OVER (ORDER BY e.earned")
        ? [
            {
              rank: 1,
              user_id: POINTS_USER_A,
              earned: 1200,
              balance: 6200,
              joined_at: "2026-01-01T00:00:00.000Z",
              top_source: "read",
            },
            {
              rank: 2,
              user_id: POINTS_USER_B,
              earned: 900,
              balance: 1400,
              joined_at: "2026-02-01T00:00:00.000Z",
              top_source: "surveyTask",
            },
          ]
        : [];
    const { out } = await page(staff, rowsFor);
    const markup = out.replace(STYLE_BLOCK, "");

    for (const id of [POINTS_USER_A, POINTS_USER_B]) {
      expect(markup).toContain(`href="/admin/collections/users/${id}"`);
    }
    expect(markup).not.toContain("@");
    expect(markup.toLowerCase()).not.toContain("email");
    expect(markup.toLowerCase()).not.toContain("username");
  });
});

describe("the Retention page", () => {
  const page = async (user: unknown, rowsFor?: (sql: string) => unknown[]) => {
    const { req, queries } = requestFor(user, rowsFor);
    return {
      out: html(
        await components.RetentionPageView({
          initPageResult: { req },
          searchParams: {},
        } as never)
      ),
      queries,
    };
  };

  it("gives staff the figures, both empty states and the notices", async () => {
    const { out, queries } = await page(staff);

    for (const label of [
      "Active devices (7 days)",
      "Active devices (30 days)",
      "Stickiness",
      "Activation (24 hours)",
    ]) {
      expect(out).toContain(label);
    }
    expect(out).toContain("No accounts signed up in this period.");
    expect(out).toContain("No devices were first seen in this period.");
    expect(out).toContain("Cohorts under 20 devices are noisy.");
    expect(out).toContain(
      "Guest-to-registered conversion is not measured yet."
    );
    expect(queries.length).toBeGreaterThan(0);
  });

  it("refuses a partner, an app user and a signed-out viewer without querying", async () => {
    for (const user of [partnerA, appUser, null]) {
      const { out, queries } = await page(user);

      expect(out).toContain(NO_ACCESS);
      expect(queries).toHaveLength(0);
    }
  });

  it("prints no identifier, only week labels and counts", async () => {
    const rowsFor = (sql: string) => {
      if (sql.includes("AS signups")) {
        return [
          {
            week: "2026-09-14",
            signups: 3,
            mature_24h: 2,
            activated_24h: 1,
            mature_7d: 1,
            activated_7d: 1,
          },
        ];
      }
      if (sql.includes("AS devices")) {
        return [
          {
            week: "2026-09-14",
            devices: 3,
            d1_returned: 1,
            d1_eligible: 2,
            w1_returned: 0,
            w1_eligible: 0,
            w2_returned: 0,
            w2_eligible: 0,
            w4_returned: 0,
            w4_eligible: 0,
          },
        ];
      }
      return [];
    };
    const { out } = await page(staff, rowsFor);
    const markup = out.replace(STYLE_BLOCK, "");

    expect(markup).not.toContain("@");
    for (const identifier of ["email", "username", "user_id", "device_id"]) {
      expect(markup.toLowerCase()).not.toContain(identifier);
    }
  });
});

describe("the News, Points and Retention switch", () => {
  const currentHrefs = (markup: string) =>
    [...markup.matchAll(/<a aria-current="true" href="([^"]*)"/g)].map(
      (m) => m[1]
    );

  const render = async (View: typeof components.AnalyticsPageView) => {
    const { req } = requestFor(staff);
    return html(
      await View({ initPageResult: { req }, searchParams: {} } as never)
    );
  };

  it("sits on all three pages and marks the page being viewed", async () => {
    const news = await render(components.AnalyticsPageView);
    const points = await render(components.PointsPageView);
    const retention = await render(components.RetentionPageView);

    for (const page of [news, points, retention]) {
      expect(page).toContain('href="/admin/analytics"');
      expect(page).toContain('href="/admin/analytics/points"');
      expect(page).toContain('href="/admin/analytics/retention"');
    }
    expect(currentHrefs(news)).toContain("/admin/analytics");
    expect(currentHrefs(points)).toContain("/admin/analytics/points");
    expect(currentHrefs(retention)).toContain("/admin/analytics/retention");
    expect(currentHrefs(news)).not.toContain("/admin/analytics/points");
    expect(currentHrefs(points)).not.toContain("/admin/analytics/retention");
    expect(currentHrefs(retention)).not.toContain("/admin/analytics");
  });
});

describe("the large point grants alert", () => {
  it("links to the Points page", () => {
    const out = html(
      NeedsAttentionPanel({
        counts: {
          commentsHidden: 0,
          reportsPending: 0,
          identityInReview: 0,
          flagsUnreviewed: 0,
          pushFailed: 0,
          witnessWeek: 0,
          largeGrants: 3,
        },
      })
    );

    expect(out).toContain("Large point grants, 7 days");
    expect(out).toContain('href="/admin/analytics/points"');
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
    pointsPageView.Component,
    retentionPageView.Component,
    analyticsNavLink,
  ] as string[];

  it.each(referenced)("%s is exported and in the import map", (ref) => {
    const [, name] = ref.split("#");
    expect(Object.keys(components)).toContain(name);
    // Forgetting `generate:importmap` is a blank panel in production.
    expect(importMap).toContain(`"${ref}"`);
  });

  it("registers the Points page at its own address", () => {
    expect(pointsPageView.path).toBe("/analytics/points");
  });

  it("registers the Retention page as an exact route", () => {
    expect(retentionPageView).toMatchObject({
      path: "/analytics/retention",
      exact: true,
    });
    expect(analyticsViews.analyticsRetention).toBe(retentionPageView);
  });

  it("serves each analytics page at its own address, as Payload matches them", async () => {
    // Payload treats a view without `exact` as a prefix, and takes the first
    // match, so /analytics would otherwise answer for /analytics/points too.
    const require = createRequire(import.meta.url);
    const dir = path.dirname(require.resolve("@payloadcms/next/package.json"));
    const { getCustomViewByRoute } = await import(
      path.join(dir, "dist/views/Root/getCustomViewByRoute.js")
    );
    const config = {
      admin: { components: { views: analyticsViews } },
      routes: { admin: "/admin" },
    };
    const keyFor = (currentRoute: string) =>
      getCustomViewByRoute({ config, currentRoute }).viewKey;

    expect(keyFor("/admin/analytics")).toBe("analytics");
    expect(keyFor("/admin/analytics/points")).toBe("analyticsPoints");
    expect(keyFor("/admin/analytics/retention")).toBe("analyticsRetention");
  });

  it("gives every widget a permanent, unique slug", () => {
    const slugs = analyticsWidgets.map((w) => w.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("points dates are Lagos days", () => {
  // 23:30 UTC on the 19th is 00:30 on the 20th in Lagos.
  const late = "2026-10-19T23:30:00.000Z";

  it("shows a late-evening join on the Lagos day", () => {
    const out = renderToStaticMarkup(
      LeaderboardPanel({
        rows: [
          {
            rank: 1,
            userId: "u1",
            earned: 10,
            balance: 10,
            joinedAt: late,
            topSource: "read",
          },
        ],
      }) as never
    );

    expect(out).toContain("20 Oct");
    expect(out).not.toContain("19 Oct");
  });

  it("shows a late-evening grant on the Lagos day", () => {
    const out = renderToStaticMarkup(
      LargeGrantsPanel({
        grants: [
          {
            id: "g1",
            userId: "u1",
            action: "surveyTask",
            source: "form",
            points: 9000,
            at: late,
          },
        ],
      }) as never
    );

    expect(out).toContain("20 Oct");
  });
});

describe("the points tiles", () => {
  const totals = {
    issued: 100,
    spent: 40,
    reversed: 10,
    net: 50,
    activeEarners: 3,
    largeGrants: 0,
  };
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    issued: i + 1,
    spent: i,
  }));

  it("draws lines for Issued and Spent but not Net, which the daily series cannot match", () => {
    const out = renderToStaticMarkup(
      PointsKpis({
        summary: { current: totals, previous: totals, outstanding: 500 },
        daily: days,
      }) as never
    );

    expect(out).toContain("Issued, last 7 days");
    expect(out).toContain("Spent, last 7 days");
    expect(out).not.toContain("Net, last 7 days");
  });
});
