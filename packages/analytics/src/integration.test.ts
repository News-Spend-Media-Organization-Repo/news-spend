import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { PgDialect } from "@payloadcms/db-postgres/drizzle/pg-core";
import { SQL } from "bun";

import type { AnalyticsDb } from "./db";
import { giveawayReport } from "./giveaway";
import {
  newsArticleReport,
  newsDaily,
  newsEngagement,
  newsPlatforms,
  newsSummary,
  newsSurfaces,
  newsTopArticles,
  newsTopCategories,
} from "./news";
import {
  partnerDaily,
  partnerRecentConversions,
  partnerSummary,
} from "./partner";
import { resolveRange } from "./range";
import { scopeFor } from "./scope";

/**
 * The reports against a real Postgres, since the stubbed tests prove the SQL is
 * assembled but not that Postgres accepts and answers it.
 *
 * Runs only when TEST_DATABASE_URI points at a database it may write to, and
 * does its work in a schema of its own that it drops afterwards, so a blank
 * database is enough and nothing else in it is touched.
 */
const URL = process.env.TEST_DATABASE_URI;
const NOW = new Date("2026-09-20T10:00:00Z");
const SCHEMA = `analytics_test_${Math.random().toString(36).slice(2, 10)}`;

const A1 = "a0000000-0000-4000-8000-000000000001";
const A2 = "a0000000-0000-4000-8000-000000000002";
const CAT_ENERGY = "c0000000-0000-4000-8000-000000000001";
const CAT_SPORT = "c0000000-0000-4000-8000-000000000002";
const P1 = "b0000000-0000-4000-8000-000000000001";
const P2 = "b0000000-0000-4000-8000-000000000002";
const USER = "d0000000-0000-4000-8000-000000000001";

const staff = scopeFor({ collection: "admins", role: "editor" });
const partner1 = scopeFor({
  collection: "admins",
  role: "partner",
  partner: P1,
});
if (!(staff && partner1)) {
  throw new Error("fixture scopes should exist");
}

describe.skipIf(!URL)("reports against a real Postgres", () => {
  let conn: SQL;
  let db: AnalyticsDb;
  const range = resolveRange({ days: 7, now: NOW });

  beforeAll(async () => {
    // One connection, so the search_path set below applies to every statement.
    conn = new SQL(URL as string, { max: 1 });
    const dialect = new PgDialect();
    db = {
      execute: async (query) => {
        const compiled = dialect.sqlToQuery(query);
        const rows = await conn.unsafe(
          compiled.sql,
          compiled.params as never[]
        );
        return { rows: [...rows] };
      },
    };

    await conn.unsafe(`
      CREATE SCHEMA ${SCHEMA};
      SET search_path TO ${SCHEMA};
      CREATE TYPE enum_news_analytics_event AS ENUM('impression','view','read','like','dislike','share','comment');
      CREATE TYPE enum_news_analytics_platform AS ENUM('android','ios','web');
      CREATE TYPE enum_partner_conversions_status AS ENUM('clicked','converted','awarded','failed');
      CREATE TYPE enum_shop_analytics_type AS ENUM('view','click');
      CREATE TABLE categories (id uuid PRIMARY KEY, title varchar NOT NULL);
      CREATE TABLE news (id uuid PRIMARY KEY, title varchar, slug varchar, published_at timestamptz, category_id uuid);
      CREATE TABLE news_analytics (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        article_id uuid NOT NULL, event enum_news_analytics_event NOT NULL,
        user_id varchar, session_id varchar NOT NULL DEFAULT 's', device_id varchar NOT NULL,
        platform enum_news_analytics_platform, metadata jsonb, timestamp timestamptz NOT NULL);
      CREATE TABLE partners (id uuid PRIMARY KEY, company_name varchar);
      CREATE TABLE partner_content (id uuid PRIMARY KEY, title varchar);
      CREATE TABLE partner_conversions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid, partner_id uuid, content_id uuid, click_id varchar NOT NULL,
        status enum_partner_conversions_status NOT NULL DEFAULT 'clicked',
        points_awarded numeric DEFAULT 0, partner_order_id varchar,
        clicked_at timestamptz, converted_at timestamptz, awarded_at timestamptz);
      CREATE TABLE shop_analytics (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id uuid, type enum_shop_analytics_type NOT NULL, timestamp timestamptz NOT NULL);
      CREATE TYPE enum_giveaway_tickets_status AS ENUM('valid','cancelled','refunded','reversed','unpaid','fraudulent');
      CREATE TYPE enum_giveaway_engagements_source AS ENUM('partner','google');
      CREATE TYPE enum_giveaway_engagements_type AS ENUM('boost','featured_offer');
      CREATE TYPE enum_giveaway_engagements_completion AS ENUM('completed','incomplete','abandoned','failed');
      CREATE TYPE enum_giveaway_tier AS ENUM('tier1','tier2','tier3');
      CREATE TYPE enum_giveaway_winners_claim AS ENUM('unclaimed','claimed','expired','forfeited','disqualified');
      CREATE TYPE enum_giveaway_winners_fulfilment AS ENUM('pending','awaiting_verification','on_hold','in_progress','fulfilled','cancelled');
      CREATE TYPE enum_giveaway_attempt_outcome AS ENUM('sent','already_sent','retryable_failure','permanent_failure','skipped');
      CREATE TABLE giveaways (
        id uuid PRIMARY KEY, name varchar, status varchar NOT NULL DEFAULT 'draft',
        start_date timestamptz NOT NULL, end_date timestamptz NOT NULL,
        total_valid_participants numeric, draw_completed_at timestamptz);
      CREATE TABLE giveaway_tickets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        giveaway_id uuid NOT NULL, user_id uuid NOT NULL, quantity numeric NOT NULL,
        status enum_giveaway_tickets_status NOT NULL DEFAULT 'valid',
        purchased_at timestamptz NOT NULL);
      CREATE TABLE giveaway_engagements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        giveaway_id uuid NOT NULL, user_id uuid NOT NULL,
        type enum_giveaway_engagements_type NOT NULL,
        source enum_giveaway_engagements_source NOT NULL DEFAULT 'partner',
        completion_status enum_giveaway_engagements_completion NOT NULL DEFAULT 'completed',
        completed_at timestamptz NOT NULL);
      CREATE TABLE giveaway_pool_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        giveaway_id uuid NOT NULL, tier enum_giveaway_tier NOT NULL,
        candidate_count numeric NOT NULL, locked_at timestamptz NOT NULL);
      CREATE TABLE giveaway_prizes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        giveaway_id uuid NOT NULL, tier enum_giveaway_tier NOT NULL,
        max_units numeric NOT NULL, units_awarded numeric NOT NULL DEFAULT 0);
      CREATE TABLE giveaway_winners (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        giveaway_id uuid NOT NULL, user_id uuid NOT NULL,
        tier enum_giveaway_tier NOT NULL, prize_name varchar,
        claim_status enum_giveaway_winners_claim NOT NULL DEFAULT 'unclaimed',
        fulfilment_status enum_giveaway_winners_fulfilment NOT NULL DEFAULT 'pending',
        selected_at timestamptz NOT NULL);
      CREATE TABLE giveaway_fulfilment_attempts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        winner_id uuid NOT NULL,
        outcome enum_giveaway_attempt_outcome NOT NULL,
        attempted_at timestamptz NOT NULL);

      INSERT INTO categories VALUES ('${CAT_ENERGY}', 'Energy'), ('${CAT_SPORT}', 'Sports');
      INSERT INTO news VALUES
        ('${A1}', 'Fuel price review', 'fuel', '2026-09-12T08:00:00Z', '${CAT_ENERGY}'),
        ('${A2}', 'Squad named', 'squad', '2026-09-12T09:00:00Z', '${CAT_SPORT}');
      INSERT INTO partners VALUES ('${P1}', 'Shopwise'), ('${P2}', 'FreshCart');
      INSERT INTO partner_content VALUES ('c1000000-0000-4000-8000-000000000001', 'Weekend offer');
    `);

    const ev = (
      article: string,
      event: string,
      at: string,
      opts: { device?: string; platform?: string; meta?: object } = {}
    ) =>
      `('${article}', '${event}', '${opts.device ?? "dev-1"}', ${opts.platform ? `'${opts.platform}'` : "NULL"}, '${JSON.stringify(opts.meta ?? {})}', '${at}')`;
    await conn.unsafe(`
      INSERT INTO news_analytics (article_id, event, device_id, platform, metadata, timestamp) VALUES
        ${[
          // A1, this period
          ev(A1, "impression", "2026-09-19T10:00:00Z", {
            platform: "ios",
            meta: { screen: "HomeFeed" },
          }),
          ev(A1, "impression", "2026-09-19T10:01:00Z", {
            device: "dev-2",
            platform: "android",
            meta: { screen: "HomeTrending" },
          }),
          ev(A1, "impression", "2026-09-20T08:00:00Z", {
            platform: "ios",
            meta: { screen: "HomeRelated" },
          }),
          ev(A1, "impression", "2026-09-20T08:00:00Z", {
            platform: "ios",
            meta: { screen: "Brand new" },
          }),
          ev(A1, "view", "2026-09-19T10:02:00Z", { platform: "ios" }),
          ev(A1, "view", "2026-09-19T10:03:00Z", {
            device: "dev-2",
            platform: "android",
          }),
          ev(A1, "read", "2026-09-19T10:09:00Z", { platform: "ios" }),
          ev(A1, "like", "2026-09-19T10:10:00Z", { platform: "ios" }),
          ev(A1, "share", "2026-09-19T10:11:00Z", {
            platform: "ios",
            meta: { shareMethod: "whatsapp" },
          }),
          ev(A1, "share", "2026-09-19T10:12:00Z", {
            platform: "ios",
            meta: { shareMethod: "whatsapp" },
          }),
          ev(A1, "share", "2026-09-19T10:13:00Z", {
            platform: "ios",
            meta: { shareMethod: "copy" },
          }),
          // 23:30 UTC on the 20th: still the 20th in UTC, already the 21st in Lagos
          ev(A1, "view", "2026-09-20T23:30:00Z", { platform: "web" }),
          // A2, this period
          ev(A2, "impression", "2026-09-18T12:00:00Z", {
            platform: "ios",
            meta: { screen: "HomeFeed" },
          }),
          ev(A2, "view", "2026-09-18T12:01:00Z", { platform: "ios" }),
          ev(A2, "view", "2026-09-18T12:02:00Z", {
            device: "dev-3",
            platform: "ios",
          }),
          ev(A2, "view", "2026-09-18T12:03:00Z", {
            device: "dev-4",
            platform: "ios",
          }),
          // previous period (7 days, 2026-09-07..13) and long ago (outside both)
          ev(A1, "view", "2026-09-10T12:00:00Z", { platform: "ios" }),
          ev(A1, "view", "2026-08-01T12:00:00Z", { platform: "ios" }),
        ].join(",\n")};

      INSERT INTO partner_conversions (user_id, partner_id, content_id, click_id, status, points_awarded, partner_order_id, clicked_at, converted_at, awarded_at) VALUES
        ('${USER}', '${P1}', 'c1000000-0000-4000-8000-000000000001', 'clk-1', 'awarded', 250, 'ORD-1', '2026-09-19T09:00:00Z', '2026-09-19T09:30:00Z', '2026-09-19T09:31:00Z'),
        ('${USER}', '${P1}', NULL, 'clk-2', 'converted', 0, 'ORD-2', '2026-09-19T11:00:00Z', '2026-09-20T07:00:00Z', NULL),
        ('${USER}', '${P1}', NULL, 'clk-3', 'clicked', 0, NULL, '2026-09-20T08:00:00Z', NULL, NULL),
        ('${USER}', '${P1}', NULL, 'clk-4', 'failed', 0, NULL, '2026-09-18T08:00:00Z', NULL, NULL),
        ('${USER}', '${P2}', NULL, 'clk-5', 'awarded', 400, 'ORD-5', '2026-09-19T09:00:00Z', '2026-09-19T09:10:00Z', '2026-09-19T09:11:00Z'),
        ('${USER}', '${P1}', NULL, 'clk-6', 'clicked', 0, NULL, '2026-09-10T08:00:00Z', NULL, NULL);
      INSERT INTO shop_analytics (store_id, type, timestamp) VALUES
        ('${P1}', 'view', '2026-09-19T10:00:00Z'), ('${P1}', 'view', '2026-09-19T10:01:00Z'),
        ('${P1}', 'click', '2026-09-19T10:02:00Z'), ('${P2}', 'view', '2026-09-19T10:00:00Z');

      INSERT INTO giveaways (id, name, status, start_date, end_date, total_valid_participants, draw_completed_at) VALUES
        ('e1000000-0000-4000-8000-000000000001', 'Weekly draw', 'active', '2026-09-14T08:00:00Z', '2026-09-28T08:00:00Z', 40, NULL);
      INSERT INTO giveaway_tickets (giveaway_id, user_id, quantity, status, purchased_at) VALUES
        ('e1000000-0000-4000-8000-000000000001', '${USER}', 5, 'valid', '2026-09-15T08:00:00Z'),
        ('e1000000-0000-4000-8000-000000000001', '${USER}', 3, 'valid', '2026-09-16T08:00:00Z'),
        ('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 2, 'valid', '2026-09-19T08:00:00Z'),
        ('e1000000-0000-4000-8000-000000000001', '${USER}', 1, 'cancelled', '2026-09-15T09:00:00Z');
      INSERT INTO giveaway_engagements (giveaway_id, user_id, type, source, completion_status, completed_at) VALUES
        ('e1000000-0000-4000-8000-000000000001', '${USER}', 'boost', 'partner', 'completed', '2026-09-15T08:00:00Z'),
        ('e1000000-0000-4000-8000-000000000001', '${USER}', 'boost', 'google', 'completed', '2026-09-15T09:00:00Z'),
        ('e1000000-0000-4000-8000-000000000001', '${USER}', 'featured_offer', 'partner', 'completed', '2026-09-16T08:00:00Z'),
        ('e1000000-0000-4000-8000-000000000001', '${USER}', 'boost', 'partner', 'incomplete', '2026-09-16T09:00:00Z');
      INSERT INTO giveaway_pool_snapshots (giveaway_id, tier, candidate_count, locked_at) VALUES
        ('e1000000-0000-4000-8000-000000000001', 'tier1', 30, '2026-09-19T08:00:00Z'),
        ('e1000000-0000-4000-8000-000000000001', 'tier2', 12, '2026-09-19T08:00:00Z');
      INSERT INTO giveaway_prizes (giveaway_id, tier, max_units, units_awarded) VALUES
        ('e1000000-0000-4000-8000-000000000001', 'tier1', 5, 2),
        ('e1000000-0000-4000-8000-000000000001', 'tier2', 10, 0);
      INSERT INTO giveaway_winners (id, giveaway_id, user_id, tier, prize_name, claim_status, fulfilment_status, selected_at) VALUES
        ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', '${USER}', 'tier1', 'Airtime 1GB', 'unclaimed', 'pending', '2026-09-20T08:00:00Z'),
        ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', '${USER}', 'tier1', 'Airtime 2GB', 'claimed', 'fulfilled', '2026-09-20T07:00:00Z'),
        ('e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', '${USER}', 'tier2', 'Headphones', 'unclaimed', 'on_hold', '2026-09-19T08:00:00Z');
      INSERT INTO giveaway_fulfilment_attempts (winner_id, outcome, attempted_at) VALUES
        ('e2000000-0000-4000-8000-000000000001', 'sent', '2026-09-20T09:00:00Z'),
        ('e2000000-0000-4000-8000-000000000001', 'retryable_failure', '2026-09-20T09:30:00Z'),
        ('e2000000-0000-4000-8000-000000000002', 'sent', '2026-09-20T07:30:00Z'),
        ('e2000000-0000-4000-8000-000000000003', 'skipped', '2026-09-19T10:00:00Z');
    `);
  });

  afterAll(async () => {
    await conn.unsafe(`DROP SCHEMA ${SCHEMA} CASCADE`);
    await conn.close();
  });

  it("totals the period and compares it with the one before", async () => {
    const { current, previous } = await newsSummary(db, staff, { range });

    expect(current).toMatchObject({
      impressions: 5,
      views: 6,
      reads: 1,
      likes: 1,
      shares: 3,
      readers: 4,
      ctr: 120,
      readRate: 16.7,
    });
    expect(previous.views).toBe(1);
  });

  it("filters to a platform and to one article", async () => {
    const ios = await newsSummary(db, staff, { range, platform: "ios" });
    const one = await newsSummary(db, staff, { range, articleId: A2 });

    expect(ios.current.views).toBe(4);
    expect(one.current).toMatchObject({ impressions: 1, views: 3, readers: 3 });
  });

  it("fills every day, and puts a late-evening event on the right day for the zone", async () => {
    const utc = await newsDaily(db, staff, { range });
    // Asked at 11:00 on the 21st in Lagos, so the window ends on the 21st.
    const lagos = await newsDaily(db, staff, {
      range: resolveRange({
        days: 7,
        now: new Date("2026-09-21T10:00:00Z"),
        timeZone: "Africa/Lagos",
      }),
    });

    expect(utc).toHaveLength(7);
    expect(utc.find((d) => d.date === "2026-09-20")?.views).toBe(1);
    expect(utc.find((d) => d.date === "2026-09-17")).toEqual({
      date: "2026-09-17",
      impressions: 0,
      views: 0,
      reads: 0,
    });
    // 23:30 UTC on the 20th is 00:30 on the 21st in Lagos: a different day.
    expect(lagos.find((d) => d.date === "2026-09-21")?.views).toBe(1);
    expect(lagos.find((d) => d.date === "2026-09-20")?.views).toBe(0);
  });

  it("groups impressions by surface", async () => {
    expect(await newsSurfaces(db, staff, { range })).toEqual([
      { surface: "HomeFeed", impressions: 2 },
      { surface: "HomeTrending", impressions: 1 },
      { surface: "HomeRelated", impressions: 1 },
      { surface: "other", impressions: 1 },
    ]);
  });

  it("splits views and reads by platform", async () => {
    const platforms = await newsPlatforms(db, staff, { range });

    expect(platforms.find((p) => p.platform === "ios")).toEqual({
      platform: "ios",
      views: 4,
      reads: 1,
    });
    expect(platforms.map((p) => p.platform)).toContain("web");
  });

  it("reports engagement and how it was shared", async () => {
    const e = await newsEngagement(db, staff, { range });

    expect(e).toMatchObject({ likes: 1, shares: 3 });
    expect(e.shareMethods).toEqual([
      { method: "whatsapp", shares: 2 },
      { method: "copy", shares: 1 },
    ]);
  });

  it("ranks articles and categories", async () => {
    const top = await newsTopArticles(db, staff, { range });
    const cats = await newsTopCategories(db, staff, { range });

    expect(top.map((t) => t.title)).toEqual([
      "Fuel price review",
      "Squad named",
    ]);
    expect(top[0]).toMatchObject({
      category: "Energy",
      views: 3,
      publishedAt: "2026-09-12T08:00:00.000Z",
    });
    expect(cats.map((c) => c.category)).toEqual(["Energy", "Sports"]);
  });

  it("assembles an article's whole report", async () => {
    const report = await newsArticleReport(db, staff, A1, { range });

    expect(report.article?.title).toBe("Fuel price review");
    expect(report.summary.current.views).toBe(3);
    expect(report.daily).toHaveLength(7);
    expect(report.engagement.shareMethods[0]).toEqual({
      method: "whatsapp",
      shares: 2,
    });
  });

  describe("giveaway", () => {
    const G1 = "e1000000-0000-4000-8000-000000000001";

    it("reports a live giveaway's whole story", async () => {
      const report = await giveawayReport(db, staff, G1, {
        range,
        now: NOW,
      });

      expect(report.state).toMatchObject({
        name: "Weekly draw",
        status: "active",
        live: true,
        msToDraw: 684_000_000,
        totalValidParticipants: 40,
        drawCompletedAt: null,
      });
      expect(report.tickets).toEqual({ issued: 10, entrants: 2 });
      expect(report.ticketDaily.find((d) => d.date === "2026-09-15")).toEqual({
        date: "2026-09-15",
        issued: 5,
        entrants: 1,
      });
      expect(report.ticketDaily.find((d) => d.date === "2026-09-19")).toEqual({
        date: "2026-09-19",
        issued: 2,
        entrants: 1,
      });
      expect(report.engagements.totals).toEqual({
        partner: 2,
        google: 1,
        boost: 2,
        featuredOffer: 1,
      });
      expect(
        report.engagements.days.find((d) => d.date === "2026-09-16")
      ).toEqual({ date: "2026-09-16", partner: 1, google: 0 });
      expect(report.pool).toEqual([
        {
          tier: "tier1",
          candidates: 30,
          lockedAt: "2026-09-19T08:00:00.000Z",
        },
        {
          tier: "tier2",
          candidates: 12,
          lockedAt: "2026-09-19T08:00:00.000Z",
        },
      ]);
      expect(report.prizes).toEqual([
        { tier: "tier1", maxUnits: 5, awarded: 2, remaining: 3 },
        { tier: "tier2", maxUnits: 10, awarded: 0, remaining: 10 },
      ]);
      expect(report.winners.total).toBe(3);
      expect(report.winners.byTier).toEqual([
        { tier: "tier1", winners: 2 },
        { tier: "tier2", winners: 1 },
      ]);
      expect(report.recentWinners.map((w) => w.prize)).toEqual([
        "Airtime 1GB",
        "Airtime 2GB",
        "Headphones",
      ]);
      expect(report.fulfilment).toEqual({
        sent: 2,
        alreadySent: 0,
        retryableFailures: 1,
        permanentFailures: 0,
        skipped: 1,
      });
      expect(report.attention).toEqual({
        onHold: 1,
        awaitingVerification: 0,
        disqualified: 0,
        fulfilmentFailing: 1,
      });
      expect(JSON.stringify(report)).not.toContain(USER);
    });
  });

  describe("partners", () => {
    it("shows a partner only their own numbers", async () => {
      const { conversions, shop } = await partnerSummary(db, partner1, {
        range,
      });

      expect(conversions.current).toEqual({
        clicks: 4,
        waiting: 1,
        pending: 1,
        awarded: 1,
        failed: 1,
        conversions: 2,
        pointsAwarded: 250,
        conversionRate: 50,
      });
      expect(conversions.previous.clicks).toBe(1);
      expect(shop.current).toEqual({ views: 2, clicks: 1 });
    });

    it("shows staff every partner together, or one on request", async () => {
      const all = await partnerSummary(db, staff, { range });
      const two = await partnerSummary(db, staff, { range, partnerId: P2 });

      expect(all.conversions.current.clicks).toBe(5);
      expect(two.conversions.current).toMatchObject({
        clicks: 1,
        awarded: 1,
        pointsAwarded: 400,
      });
    });

    it("counts clicks and conversions on their own days", async () => {
      const days = await partnerDaily(db, partner1, { range });

      expect(days).toHaveLength(7);
      expect(days.find((d) => d.date === "2026-09-19")).toEqual({
        date: "2026-09-19",
        clicks: 2,
        conversions: 1,
      });
      expect(days.find((d) => d.date === "2026-09-20")).toEqual({
        date: "2026-09-20",
        clicks: 1,
        conversions: 1,
      });
    });

    it("lists a partner's own conversions, newest first, with no reader in them", async () => {
      const rows = await partnerRecentConversions(db, partner1, {});

      // By the latest thing that happened to each: clk-3 was clicked at 08:00
      // on the 20th, clk-2 converted at 07:00 that day, and so on back.
      expect(rows.map((r) => r.clickId)).toEqual([
        "clk-3",
        "clk-2",
        "clk-1",
        "clk-4",
        "clk-6",
      ]);
      expect(rows.every((r) => r.partnerName === "Shopwise")).toBe(true);
      expect(rows.find((r) => r.clickId === "clk-1")).toMatchObject({
        status: "awarded",
        pointsAwarded: 250,
        partnerOrderId: "ORD-1",
        content: "Weekend offer",
      });
      expect(JSON.stringify(rows)).not.toContain(USER);
    });
  });
});
