import { describe, expect, it } from "bun:test";

import {
  newsArticleReport,
  newsDaily,
  newsEngagement,
  newsEventQuality,
  newsPlatforms,
  newsSummary,
  newsSurfaces,
  newsTopArticles,
  newsTopCategories,
} from "./news";
import { newsNotices } from "./notices";
import { AnalyticsAccessError } from "./scope";
import { ARTICLE, PARTNER, range, STAFF, stubDb } from "./test-utils";

const ISO_DATE = /^\d{4}-\d\d-\d\d$/;

describe("news reports are staff only", () => {
  const filter = { range: range() };
  const calls: [
    string,
    (db: ReturnType<typeof stubDb>["db"]) => Promise<unknown>,
  ][] = [
    ["newsSummary", (db) => newsSummary(db, PARTNER, filter)],
    ["newsDaily", (db) => newsDaily(db, PARTNER, filter)],
    ["newsSurfaces", (db) => newsSurfaces(db, PARTNER, filter)],
    ["newsPlatforms", (db) => newsPlatforms(db, PARTNER, filter)],
    ["newsEngagement", (db) => newsEngagement(db, PARTNER, filter)],
    ["newsTopArticles", (db) => newsTopArticles(db, PARTNER, filter)],
    ["newsTopCategories", (db) => newsTopCategories(db, PARTNER, filter)],
    ["newsEventQuality", (db) => newsEventQuality(db, PARTNER, filter)],
    [
      "newsArticleReport",
      (db) => newsArticleReport(db, PARTNER, ARTICLE, filter),
    ],
  ];

  it.each(
    calls
  )("%s refuses a partner before touching the database", async (_name, run) => {
    const { db, queries } = stubDb();

    await expect(run(db)).rejects.toBeInstanceOf(AnalyticsAccessError);
    expect(queries).toHaveLength(0);
  });
});

describe("newsSummary", () => {
  const rowsByEvent = (query: { params: unknown[] }) =>
    // Both windows get the same rows: the shape is what is under test here.
    query.params.length >= 0
      ? [
          { event: "impression", n: 200, devices: 90 },
          { event: "view", n: 90, devices: 60, matched: 54 },
          { event: "read", n: 18, devices: 15 },
          { event: "like", n: 7, devices: 6 },
          { event: "share", n: 3, devices: 3 },
        ]
      : [];

  it("totals each event and derives the ratios", async () => {
    const { db } = stubDb(rowsByEvent);

    const { current } = await newsSummary(db, STAFF, { range: range() });

    expect(current).toMatchObject({
      impressions: 200,
      views: 90,
      reads: 18,
      likes: 7,
      shares: 3,
      dislikes: 0,
      comments: 0,
      readers: 60,
      matchedViews: 54,
      directOpens: 36,
      ctr: 27,
      readRate: 20,
    });
  });

  it("counts a view toward click-through only when its device saw the article first", async () => {
    const { db, queries } = stubDb(rowsByEvent);

    await newsSummary(db, STAFF, { range: range() });

    const sql = queries[0]?.sql ?? "";
    expect(sql).toContain("EXISTS");
    expect(sql).toContain("i.device_id = e.device_id");
    expect(sql).toContain("i.timestamp <= e.timestamp");
  });

  it("reports every view as a direct open, and no click-through, when there are no impressions", async () => {
    const { db } = stubDb([{ event: "view", n: 21, devices: 17, matched: 0 }]);

    const { current } = await newsSummary(db, STAFF, { range: range() });

    expect(current).toMatchObject({
      views: 21,
      matchedViews: 0,
      directOpens: 21,
      ctr: null,
    });
  });

  it("leaves a ratio empty rather than dividing by zero", async () => {
    const { db } = stubDb([]);

    const { current } = await newsSummary(db, STAFF, { range: range() });

    expect(current.impressions).toBe(0);
    expect(current.ctr).toBeNull();
    expect(current.readRate).toBeNull();
  });

  it("runs the period and the one before it as two statements", async () => {
    const { db, queries } = stubDb();
    const r = range(7);

    await newsSummary(db, STAFF, { range: r });

    expect(queries).toHaveLength(2);
    const dates = queries.map((q) =>
      q.params.filter((p) => ISO_DATE.test(String(p)))
    );
    expect(dates).toContainEqual([r.current.from, r.current.to]);
    expect(dates).toContainEqual([r.previous.from, r.previous.to]);
  });

  it("binds the platform and article rather than writing them into the text", async () => {
    const { db, queries } = stubDb();

    await newsSummary(db, STAFF, {
      range: range(),
      platform: "ios",
      articleId: ARTICLE,
    });

    const q = queries[0];
    expect(q?.params).toContain("ios");
    expect(q?.params).toContain(ARTICLE);
    expect(q?.sql).not.toContain(ARTICLE);
    expect(q?.sql).toContain("e.platform =");
    expect(q?.sql).toContain("e.article_id =");
  });

  it("refuses an unknown platform and a malformed article id", async () => {
    const { db, queries } = stubDb();

    await expect(
      newsSummary(db, STAFF, { range: range(), platform: "symbian" as never })
    ).rejects.toThrow(RangeError);
    await expect(
      newsSummary(db, STAFF, {
        range: range(),
        articleId: "1; DROP TABLE news",
      })
    ).rejects.toThrow(RangeError);
    expect(queries).toHaveLength(0);
  });
});

describe("newsDaily", () => {
  it("returns every day of the period, zero where nothing happened", async () => {
    const r = range(7);
    const { db } = stubDb([
      { day: r.current.from, event: "view", n: 4 },
      { day: r.current.to, event: "impression", n: 9 },
      { day: r.current.to, event: "read", n: 1 },
      // A day outside the period is ignored rather than added.
      { day: "2020-01-01", event: "view", n: 999 },
    ]);

    const days = await newsDaily(db, STAFF, { range: r });

    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({
      date: r.current.from,
      impressions: 0,
      views: 4,
      reads: 0,
    });
    expect(days[3]).toEqual({
      date: days[3]?.date ?? "",
      impressions: 0,
      views: 0,
      reads: 0,
    });
    expect(days[6]).toEqual({
      date: r.current.to,
      impressions: 9,
      views: 0,
      reads: 1,
    });
  });
});

describe("newsSurfaces", () => {
  it("always lists the known surfaces, and groups anything else", async () => {
    const { db } = stubDb([
      { surface: "HomeFeed", n: 500 },
      { surface: "HomeTrending", n: 40 },
      { surface: "SomethingNew", n: 3 },
      { surface: "unknown", n: 2 },
    ]);

    const surfaces = await newsSurfaces(db, STAFF, { range: range() });

    expect(surfaces).toEqual([
      { surface: "HomeFeed", impressions: 500 },
      { surface: "HomeTrending", impressions: 40 },
      { surface: "HomeRelated", impressions: 0 },
      { surface: "other", impressions: 5 },
    ]);
  });

  it("has no other row when nothing else was reported", async () => {
    const { db } = stubDb([]);

    const surfaces = await newsSurfaces(db, STAFF, { range: range() });

    expect(surfaces.map((s) => s.surface)).toEqual([
      "HomeFeed",
      "HomeTrending",
      "HomeRelated",
    ]);
  });
});

describe("newsTopArticles", () => {
  it("returns the articles with their ratios", async () => {
    const { db } = stubDb([
      {
        id: ARTICLE,
        title: "Fuel price review",
        slug: "fuel",
        category: "Energy",
        published_at: new Date("2026-09-12T08:00:00Z"),
        impressions: 200,
        views: 100,
        reads: 25,
        readers: 60,
        matched_views: 80,
        trend: null,
      },
    ]);

    const [top] = await newsTopArticles(db, STAFF, { range: range() });

    expect(top).toMatchObject({
      title: "Fuel price review",
      category: "Energy",
      publishedAt: "2026-09-12T08:00:00.000Z",
      readers: 60,
      directOpens: 20,
      ctr: 40,
      readRate: 25,
      trend: null,
    });
  });

  it("gives an article with views and no impressions no click-through, only direct opens", async () => {
    const { db } = stubDb([
      {
        id: ARTICLE,
        title: "Davido",
        slug: "d",
        category: null,
        published_at: null,
        impressions: 0,
        views: 21,
        reads: 12,
        readers: 17,
        matched_views: 0,
        trend: null,
      },
    ]);

    const [top] = await newsTopArticles(db, STAFF, { range: range() });

    expect(top).toMatchObject({ ctr: null, directOpens: 21, readers: 17 });
  });

  it("ranks by unique readers unless asked otherwise", async () => {
    const { db, queries } = stubDb();

    await newsTopArticles(db, STAFF, { range: range() });

    expect(queries[0]?.sql).toContain(
      "ORDER BY readers DESC, reads DESC, views DESC, n.id"
    );
  });

  it("orders each sort mode by its own expression", async () => {
    const orders: Record<string, string> = {
      readers: "ORDER BY readers DESC, reads DESC, views DESC, n.id",
      reads: "ORDER BY reads DESC, readers DESC, views DESC, n.id",
      views: "ORDER BY views DESC, readers DESC, n.id",
      impressions: "ORDER BY impressions DESC, views DESC, n.id",
      rising: "ORDER BY trend DESC, views DESC, n.id",
    };
    for (const [sortBy, order] of Object.entries(orders)) {
      const { db, queries } = stubDb();
      await newsTopArticles(db, STAFF, {
        range: range(),
        sortBy: sortBy as never,
      });
      expect(queries[0]?.sql).toContain(order);
    }
  });

  it("scores only rising articles, and ignores those with fewer than 3 views", async () => {
    const { db, queries } = stubDb([
      {
        id: ARTICLE,
        title: "Hot",
        slug: "h",
        category: null,
        published_at: null,
        impressions: 10,
        views: 9,
        reads: 1,
        readers: 8,
        matched_views: 5,
        trend: 2.5,
      },
    ]);

    const [rising] = await newsTopArticles(db, STAFF, {
      range: range(),
      sortBy: "rising",
    });
    expect(rising?.trend).toBe(2.5);
    expect(queries[0]?.sql).toContain("HAVING");

    const plain = stubDb();
    await newsTopArticles(plain.db, STAFF, { range: range() });
    expect(plain.queries[0]?.sql).not.toContain("HAVING");
  });

  it("clamps the limit and only sorts by a known column", async () => {
    const { db, queries } = stubDb();

    await newsTopArticles(db, STAFF, {
      range: range(),
      limit: 9999,
      sortBy: "reads",
    });
    await newsTopArticles(db, STAFF, { range: range(), limit: -5 });

    expect(queries[0]?.params).toContain(50);
    expect(queries[0]?.sql).toContain("ORDER BY reads DESC, readers DESC");
    expect(queries[1]?.params).toContain(1);
    await expect(
      newsTopArticles(db, STAFF, {
        range: range(),
        sortBy: "1; DROP TABLE news" as never,
      })
    ).rejects.toThrow(RangeError);
  });
});

describe("newsEngagement", () => {
  it("reports shares by method, most used first", async () => {
    const { db } = stubDb((q) =>
      q.sql.includes("shareMethod")
        ? [
            { method: "whatsapp", shares: 12 },
            { method: "copy", shares: 4 },
          ]
        : [
            { event: "like", n: 30, devices: 20 },
            { event: "dislike", n: 2, devices: 2 },
            { event: "share", n: 16, devices: 14 },
            { event: "comment", n: 8, devices: 6 },
          ]
    );

    const e = await newsEngagement(db, STAFF, { range: range() });

    expect(e).toEqual({
      likes: 30,
      dislikes: 2,
      shares: 16,
      comments: 8,
      shareMethods: [
        { method: "whatsapp", shares: 12 },
        { method: "copy", shares: 4 },
      ],
    });
  });
});

describe("newsArticleReport", () => {
  it("limits every part of the report to the one article", async () => {
    const { db, queries } = stubDb();

    const report = await newsArticleReport(db, STAFF, ARTICLE, {
      range: range(),
    });

    expect(report.article).toBeNull();
    const eventQueries = queries.filter((q) =>
      q.sql.includes("news_analytics")
    );
    expect(eventQueries.length).toBeGreaterThan(0);
    for (const q of eventQueries) {
      expect(q.params).toContain(ARTICLE);
    }
  });

  it("includes the article's own details when it exists", async () => {
    const { db } = stubDb((q) =>
      q.sql.includes("FROM news WHERE")
        ? [
            {
              id: ARTICLE,
              title: "T",
              slug: "t",
              published_at: "2026-09-01T00:00:00Z",
            },
          ]
        : []
    );

    const report = await newsArticleReport(db, STAFF, ARTICLE, {
      range: range(),
    });

    expect(report.article).toEqual({
      id: ARTICLE,
      title: "T",
      slug: "t",
      publishedAt: "2026-09-01T00:00:00.000Z",
    });
  });
});

describe("newsEventQuality", () => {
  it("counts the period's events and those sent without an event id", async () => {
    const { db, queries } = stubDb([{ events: 200, events_without_id: 166 }]);

    const quality = await newsEventQuality(db, STAFF, { range: range() });

    expect(quality).toEqual({ events: 200, eventsWithoutId: 166 });
    expect(queries[0]?.sql).toContain("event_id IS NULL");
  });

  it("reports an empty period as zero", async () => {
    const { db } = stubDb([]);

    expect(await newsEventQuality(db, STAFF, { range: range() })).toEqual({
      events: 0,
      eventsWithoutId: 0,
    });
  });
});

describe("newsNotices", () => {
  const ids = (
    r: ReturnType<typeof range>,
    q?: Parameters<typeof newsNotices>[1]
  ) => newsNotices(r, q).map((n) => n.id);
  const since = (from: string) => ({
    ...range(),
    current: { from, to: "2026-10-20" },
  });

  it("warns that reads are understated when the period starts before reads were reliable", () => {
    expect(ids(since("2026-10-01"))).toContain("reads-understated");
    expect(ids(since("2026-10-11"))).not.toContain("reads-understated");
    expect(ids(since("2026-10-12"))).not.toContain("reads-understated");
  });

  it("warns about events without an id above 10% only, and says how many", () => {
    const r = since("2026-10-12");
    const some = (events: number, eventsWithoutId: number) =>
      newsNotices(r, { events, eventsWithoutId });

    expect(some(100, 11).map((n) => n.id)).toContain("no-event-id");
    expect(some(100, 10).map((n) => n.id)).not.toContain("no-event-id");
    expect(some(0, 0).map((n) => n.id)).not.toContain("no-event-id");
    expect(ids(r)).not.toContain("no-event-id");
    expect(
      some(19_275, 16_055).find((n) => n.id === "no-event-id")?.message
    ).toContain("83%");
  });
});
