import { describe, expect, it, mock } from "bun:test";
import { PgDialect } from "@payloadcms/db-postgres/drizzle/pg-core";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CLICKS_DIFFER_NOTE,
  PartnerEventsDailyPanel,
  PartnerEventsItemsPanel,
  PartnerEventsKpis,
  PartnerEventsNotes,
  PartnerEventsOutliersPanel,
  parseContentParam,
  parseSurfaceParam,
  REPORTED_NOTE,
} from "../src/components/Analytics/partnerEventsPanels";
import { partnerEventsPageView } from "../src/components/Analytics/tabs";
import { DefaultTemplateStub } from "./analyticsTemplateStub";

mock.module("@payloadcms/next/templates", () => ({
  DefaultTemplate: DefaultTemplateStub,
}));
const components = await import("../src/components/Analytics");

const PARTNER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM_1 = "11111111-1111-4111-8111-111111111111";
const ITEM_2 = "22222222-2222-4222-8222-222222222222";
const staff = { collection: "admins", role: "editor" };
const partnerA = { collection: "admins", role: "partner", partner: PARTNER_A };

const TBODY = /<tbody>[\s\S]*<\/tbody>/;
const html = (node: unknown) => renderToStaticMarkup(node as never);

const totals = (over: Partial<Record<string, number | null>> = {}) => ({
  impressions: 120,
  taps: 9,
  sessionsSeen: 100,
  sessionsTapped: 8,
  tapThrough: 8,
  ...over,
});

function requestFor(user: unknown) {
  const dialect = new PgDialect();
  const queries: { sql: string; params: unknown[] }[] = [];
  const row = {
    content_id: ITEM_1,
    partner_id: PARTNER_A,
    surface: "HomeFeed",
    title: "Flash sale",
    company_name: "Acme Ltd",
    impressions: 120,
    taps: 9,
    sessions_seen: 100,
    sessions_tapped: 80,
  };
  const req = {
    user,
    payload: {
      db: {
        drizzle: {
          execute: (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
            const compiled = dialect.sqlToQuery(query);
            queries.push({ sql: compiled.sql, params: compiled.params });
            return Promise.resolve({
              rows: compiled.sql.includes("partner_content_events")
                ? [row]
                : [],
            });
          },
        },
      },
    },
  };
  return { req: req as never, queries };
}

describe("partner events panels", () => {
  it("shows impressions, taps and a dash for a missing tap-through", () => {
    const out = html(
      <PartnerEventsKpis
        current={totals({ impressions: 1234, taps: 0, tapThrough: null })}
        previous={totals()}
      />
    );

    expect(out).toContain("Impressions");
    expect(out).toContain("1,234");
    expect(out).toContain("Taps");
    expect(out).toContain("Tap-through");
    expect(out).toContain(">—<");
  });

  it("says the figures are reported by the app and what is not counted", () => {
    const out = html(<PartnerEventsNotes />);

    expect(out).toContain(REPORTED_NOTE);
    expect(out).toContain("Reported by the app.");
    expect(out).toContain("lag by up to about a minute");
    expect(out).toContain("not counted yet");
    expect(out).toContain(CLICKS_DIFFER_NOTE.replace(/'/g, "&#x27;"));
  });

  const rows = [
    {
      contentId: ITEM_1,
      title: "Flash sale",
      surface: "HomeFeed",
      ...totals(),
    },
    {
      contentId: ITEM_1,
      title: "Flash sale",
      surface: "Discover",
      ...totals({ tapThrough: null }),
    },
    {
      contentId: ITEM_2,
      title: "Loan offer",
      surface: "HomeFeed",
      ...totals(),
    },
  ];

  it("shows one row per item and surface", () => {
    const out = html(
      <PartnerEventsItemsPanel basePath="/p" days={30} rows={rows} />
    );

    expect(out.match(TBODY)?.[0].split("<tr>")).toHaveLength(4);
    expect(out).toContain("Loan offer");
    expect(out).toContain(`content=${ITEM_2}`);
    expect(out).toContain("days=30");
  });

  it("filters to the chosen surface", () => {
    const out = html(
      <PartnerEventsItemsPanel
        basePath="/p"
        days={7}
        rows={rows}
        surface="Discover"
      />
    );

    expect(out.match(TBODY)?.[0].split("<tr>")).toHaveLength(2);
  });

  it("draws a line per surface", () => {
    const days = [
      { date: "2026-10-19", surface: "HomeFeed", impressions: 3, taps: 1 },
      { date: "2026-10-20", surface: "HomeFeed", impressions: 5, taps: 0 },
      { date: "2026-10-19", surface: "Discover", impressions: 2, taps: 2 },
      { date: "2026-10-20", surface: "Discover", impressions: 0, taps: 1 },
    ];
    const out = html(<PartnerEventsDailyPanel days={days} />);

    expect(out).toContain("Impressions by surface");
    expect(out).toContain("Taps by surface");
    expect(out).toContain("HomeFeed");
    expect(out).toContain("Discover");
  });

  it("lists flagged outliers and shows an empty state", () => {
    const flagged = html(
      <PartnerEventsOutliersPanel
        rows={[
          {
            partnerId: PARTNER_A,
            contentId: ITEM_1,
            title: "Too good",
            surface: "HomeFeed",
            sessionsSeen: 80,
            tapThrough: 75,
          },
        ]}
      />
    );
    expect(flagged).toContain("Too good");
    expect(flagged).toContain("75%");
    expect(flagged).toContain("80");

    expect(html(<PartnerEventsOutliersPanel rows={[]} />)).toContain(
      "No items are above the threshold"
    );
  });
});

describe("search params", () => {
  it("accepts a uuid content id and ignores anything else", () => {
    expect(parseContentParam(ITEM_1)).toBe(ITEM_1);
    expect(parseContentParam([ITEM_2, ITEM_1])).toBe(ITEM_2);
    expect(parseContentParam("1; DROP TABLE x")).toBeUndefined();
    expect(parseContentParam(undefined)).toBeUndefined();
  });

  it("accepts only a surface that is present", () => {
    expect(parseSurfaceParam("Discover", ["Discover"])).toBe("Discover");
    expect(parseSurfaceParam("Nope", ["Discover"])).toBeUndefined();
  });
});

describe("the partner Performance view", () => {
  const docProps = (
    user: unknown,
    searchParams: Record<string, string> = {}
  ) => {
    const { req, queries } = requestFor(user);
    return {
      props: {
        initPageResult: { req, docID: PARTNER_A },
        searchParams,
        doc: { id: PARTNER_A },
      } as never,
      queries,
    };
  };

  it("adds Impressions and taps below the existing panels", async () => {
    const { props } = docProps(partnerA);
    const out = html(await components.PartnerPerformanceView(props));

    expect(out).toContain("Clicks and conversions");
    expect(out).toContain("Impressions and taps");
    expect(out).toContain("Flash sale");
    expect(out).toContain("Reported by the app.");
    expect(out).not.toContain("Unusually high tap-through");
  });

  it("scopes the new queries to the partner and never selects ids of readers", async () => {
    const { props, queries } = docProps(partnerA);
    await components.PartnerPerformanceView(props);

    const events = queries.filter((q) =>
      q.sql.includes("partner_content_events")
    );
    expect(events.length).toBeGreaterThan(0);
    for (const q of events) {
      expect(q.params).toContain(PARTNER_A);
    }
  });

  it("limits the report to one item when content is a uuid", async () => {
    const { props, queries } = docProps(partnerA, { content: ITEM_2 });
    await components.PartnerPerformanceView(props);

    const events = queries.filter((q) =>
      q.sql.includes("partner_content_events")
    );
    for (const q of events) {
      expect(q.params).toContain(ITEM_2);
    }
  });

  it("ignores an invalid content param", async () => {
    const { props, queries } = docProps(partnerA, { content: "nope'; --" });
    const out = html(await components.PartnerPerformanceView(props));

    expect(out).toContain("Impressions and taps");
    expect(out).not.toContain("Can&#x27;t show this report");
    for (const q of queries) {
      expect(q.params).not.toContain("nope'; --");
    }
  });
});

describe("the Partner events page", () => {
  const pageProps = (user: unknown) => {
    const { req, queries } = requestFor(user);
    return {
      props: { initPageResult: { req }, searchParams: {} } as never,
      queries,
    };
  };

  it("is registered as an exact route", () => {
    expect(partnerEventsPageView).toMatchObject({
      path: "/analytics/partners-events",
      exact: true,
    });
  });

  it("shows staff every partner and the outliers", async () => {
    const { props } = pageProps(staff);
    const out = html(await components.PartnerEventsPageView(props));

    expect(out).toContain("Acme Ltd");
    expect(out).toContain("Unusually high tap-through");
    expect(out).toContain("Flash sale");
  });

  it("refuses a partner without querying", async () => {
    const { props, queries } = pageProps(partnerA);
    const out = html(await components.PartnerEventsPageView(props));

    expect(out).toContain("No access");
    expect(queries).toHaveLength(0);
  });
});
