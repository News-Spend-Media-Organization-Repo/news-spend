import { describe, expect, it } from "bun:test";

import {
  DISCOVER_ITEM_TYPES,
  DISCOVER_SECTIONS,
  discoverDaily,
  discoverGames,
  discoverItems,
  discoverSections,
  discoverSummary,
} from "./discover";
import { AnalyticsAccessError } from "./scope";
import { PARTNER, range, STAFF, stubDb } from "./test-utils";

const filter = { range: range() };

describe("discover reports are staff only", () => {
  const calls: [
    string,
    (db: ReturnType<typeof stubDb>["db"]) => Promise<unknown>,
  ][] = [
    ["discoverSummary", (db) => discoverSummary(db, PARTNER, filter)],
    ["discoverSections", (db) => discoverSections(db, PARTNER, filter)],
    ["discoverItems", (db) => discoverItems(db, PARTNER, filter)],
    ["discoverGames", (db) => discoverGames(db, PARTNER, filter)],
    ["discoverDaily", (db) => discoverDaily(db, PARTNER, filter)],
  ];

  it.each(
    calls
  )("%s refuses a partner before touching the database", async (_n, run) => {
    const { db, queries } = stubDb();
    await expect(run(db)).rejects.toBeInstanceOf(AnalyticsAccessError);
    expect(queries).toHaveLength(0);
  });
});

describe("discoverSummary", () => {
  it("derives reach from openers and readers, and counts the events", async () => {
    const { db } = stubDb((q) => {
      if (q.sql.includes("COUNT(DISTINCT n.device_id)")) {
        return [{ n: 200 }];
      }
      if (q.sql.includes("GROUP BY e.event")) {
        return [
          { event: "open", n: 30 },
          { event: "game_launch", n: 12 },
          { event: "game_blocked", n: 2 },
        ];
      }
      return [{ n: 50 }];
    });

    const summary = await discoverSummary(db, STAFF, filter);

    expect(summary.openers).toEqual({ current: 50, previous: 50 });
    expect(summary.readers).toBe(200);
    expect(summary.reach).toBe(25);
    expect(summary).toMatchObject({
      itemOpens: 30,
      gameLaunches: 12,
      gamesBlocked: 2,
      gameReports: 0,
    });
  });

  it("has no reach when nobody read the news", async () => {
    const { db } = stubDb([]);
    expect((await discoverSummary(db, STAFF, filter)).reach).toBeNull();
  });
});

describe("discoverSections and discoverItems", () => {
  it("always list every section, zero when nothing was recorded", async () => {
    const { db } = stubDb([{ section: "games", views: 5, people: 3 }]);
    const sections = await discoverSections(db, STAFF, filter);
    expect(sections.map((s) => s.section)).toEqual([...DISCOVER_SECTIONS]);
    expect(sections.find((s) => s.section === "games")).toEqual({
      section: "games",
      views: 5,
      people: 3,
    });
    expect(sections.find((s) => s.section === "apps")?.views).toBe(0);
  });

  it("includes the events section, zero when nothing was recorded", async () => {
    const { db } = stubDb([]);
    const sections = await discoverSections(db, STAFF, filter);
    expect(sections.map((s) => s.section)).toEqual([...DISCOVER_SECTIONS]);
    expect(sections.find((s) => s.section === "events")).toEqual({
      section: "events",
      views: 0,
      people: 0,
    });
  });

  it("list every kind of item and keep an unknown one", async () => {
    const { db } = stubDb([
      { type: "game", opens: 9, people: 4 },
      { type: "widget", opens: 1, people: 1 },
    ]);
    const items = await discoverItems(db, STAFF, filter);
    expect(
      items.slice(0, DISCOVER_ITEM_TYPES.length).map((i) => i.type)
    ).toEqual([...DISCOVER_ITEM_TYPES]);
    expect(items.find((i) => i.type === "game")?.opens).toBe(9);
    expect(items.find((i) => i.type === "event")).toEqual({
      type: "event",
      opens: 0,
      people: 0,
    });
    expect(items.at(-1)).toEqual({ type: "widget", opens: 1, people: 1 });
  });
});

describe("discoverGames and discoverDaily", () => {
  it("bounds the number of games asked for", async () => {
    const { db, queries } = stubDb([]);
    await discoverGames(db, STAFF, { ...filter, limit: 9999 });
    expect(queries[0]?.params).toContain(50);
  });

  it("fills days with no activity as zero", async () => {
    const { db } = stubDb([{ day: range().current.to, n: 7 }]);
    const days = await discoverDaily(db, STAFF, filter);
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toEqual({ date: range().current.to, openers: 7 });
    expect(days[0]?.openers).toBe(0);
  });
});
