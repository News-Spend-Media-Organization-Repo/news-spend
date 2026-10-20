import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { PgDialect } from "@payloadcms/db-postgres/drizzle/pg-core";
import { SQL } from "bun";
import { needsAttention, pushReport } from "./attention";
import {
  audienceCountries,
  audienceDaily,
  audienceDevices,
  audienceSummary,
  feedbackSummary,
} from "./audience";
import type { AnalyticsDb } from "./db";
import {
  discoverDaily,
  discoverGames,
  discoverItems,
  discoverSections,
  discoverSummary,
} from "./discover";
import { giveawayReport } from "./giveaway";
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
import {
  partnerDaily,
  partnerPostbackHealth,
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
const A3 = "a0000000-0000-4000-8000-000000000003";
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
      CREATE TYPE enum_push_tokens_device_type AS ENUM('ios','android','web');
      CREATE TABLE categories (id uuid PRIMARY KEY, title varchar NOT NULL);
      CREATE TABLE news (id uuid PRIMARY KEY, title varchar, slug varchar, published_at timestamptz, category_id uuid);
      CREATE TABLE news_analytics (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        article_id uuid NOT NULL, event enum_news_analytics_event NOT NULL,
        user_id varchar, session_id varchar NOT NULL DEFAULT 's', device_id varchar NOT NULL, event_id varchar,
        platform enum_news_analytics_platform, metadata jsonb, timestamp timestamptz NOT NULL);
      CREATE TABLE partners (id uuid PRIMARY KEY, company_name varchar);
      CREATE TABLE partner_content (id uuid PRIMARY KEY, title varchar);
      CREATE TABLE partner_conversions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid, partner_id uuid, content_id uuid, click_id varchar NOT NULL,
        status enum_partner_conversions_status NOT NULL DEFAULT 'clicked',
        points_awarded numeric DEFAULT 0, partner_order_id varchar,
        clicked_at timestamptz, converted_at timestamptz, awarded_at timestamptz);
      CREATE TYPE enum_partner_postbacks_outcome AS ENUM('accepted','failed_reported','duplicate','rejected');
      CREATE TABLE partner_postbacks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id uuid NOT NULL, click_id varchar NOT NULL,
        outcome enum_partner_postbacks_outcome NOT NULL, reason varchar,
        received_at timestamptz NOT NULL);
      CREATE TABLE shop_analytics (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id uuid, type enum_shop_analytics_type NOT NULL, timestamp timestamptz NOT NULL);
      CREATE TABLE users (
        id uuid PRIMARY KEY, is_anonymous boolean, created_at timestamptz NOT NULL,
        last_active timestamptz, _verified boolean NOT NULL DEFAULT FALSE,
        country varchar, verified_country varchar);
      CREATE TABLE push_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL, status varchar NOT NULL DEFAULT 'active',
        device_type enum_push_tokens_device_type, app_version varchar);
      CREATE TABLE feedback (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type varchar NOT NULL, rating numeric NOT NULL, created_at timestamptz NOT NULL);
      CREATE TYPE enum_comments_moderation_status AS ENUM('visible','hidden');
      CREATE TYPE enum_content_reports_status AS ENUM('pending','resolved','dismissed');
      CREATE TYPE enum_identity_checks_status AS ENUM('Not Started','In Progress','In Review','Approved','Declined','Abandoned','Expired');
      CREATE TYPE enum_notification_deliveries_status AS ENUM('pending','delivered','opened','failed');
      CREATE TYPE enum_giveaway_account_flags_trust_status AS ENUM('ok','suspicious','disqualified');
      CREATE TABLE comments (id uuid PRIMARY KEY, moderation_status enum_comments_moderation_status NOT NULL DEFAULT 'visible');
      CREATE TABLE content_reports (id uuid PRIMARY KEY, status enum_content_reports_status NOT NULL DEFAULT 'pending');
      CREATE TABLE identity_checks (id uuid PRIMARY KEY, status enum_identity_checks_status NOT NULL DEFAULT 'Not Started');
      CREATE TABLE giveaway_account_flags (id uuid PRIMARY KEY, trust_status enum_giveaway_account_flags_trust_status NOT NULL DEFAULT 'suspicious', reviewed_by_id uuid);
      CREATE TABLE notifications (id uuid PRIMARY KEY, title varchar, sent_at timestamptz);
      CREATE TABLE notification_deliveries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id uuid NOT NULL, status enum_notification_deliveries_status NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE witness_reports (id uuid PRIMARY KEY, created_at timestamptz NOT NULL);
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
        ('${A2}', 'Squad named', 'squad', '2026-09-12T09:00:00Z', '${CAT_SPORT}'),
        ('${A3}', 'Late news', 'late', '2026-09-12T10:00:00Z', '${CAT_SPORT}');
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
      INSERT INTO partner_postbacks (partner_id, click_id, outcome, reason, received_at) VALUES
        ('${P1}', 'a1', 'accepted', NULL, '2026-09-19T10:00:00Z'),
        ('${P1}', 'a2', 'accepted', NULL, '2026-09-19T11:00:00Z'),
        ('${P1}', 'f1', 'failed_reported', NULL, '2026-09-18T10:00:00Z'),
        ('${P1}', 'd1', 'duplicate', NULL, '2026-09-19T12:00:00Z'),
        ('${P1}', 'r1', 'rejected', 'signature does not match', '2026-09-19T13:00:00Z'),
        ('${P1}', 'r2', 'rejected', 'signature does not match', '2026-09-19T14:00:00Z'),
        ('${P1}', 'r3', 'rejected', 'missing signature', '2026-09-20T08:00:00Z'),
        ('${P1}', 'old', 'accepted', NULL, '2026-08-01T10:00:00Z'),
        ('${P2}', 'b1', 'accepted', NULL, '2026-09-19T10:00:00Z'),
        ('${P2}', 'b2', 'rejected', 'partner has no webhook secret', '2026-09-19T11:00:00Z');
      INSERT INTO shop_analytics (store_id, type, timestamp) VALUES
        ('${P1}', 'view', '2026-09-19T10:00:00Z'), ('${P1}', 'view', '2026-09-19T10:01:00Z'),
        ('${P1}', 'click', '2026-09-19T10:02:00Z'), ('${P2}', 'view', '2026-09-19T10:00:00Z');

      INSERT INTO users (id, is_anonymous, created_at, last_active, _verified, country, verified_country) VALUES
        ('e0000000-0000-4000-8000-000000000001', FALSE, '2026-09-15T08:00:00Z', '2026-09-19T09:00:00Z', TRUE, 'NG', 'NG'),
        ('e0000000-0000-4000-8000-000000000002', FALSE, '2026-09-10T08:00:00Z', '2026-09-01T08:00:00Z', FALSE, 'GH', NULL),
        ('e0000000-0000-4000-8000-000000000003', FALSE, '2026-08-01T08:00:00Z', '2026-09-18T08:00:00Z', TRUE, NULL, 'US'),
        ('e0000000-0000-4000-8000-000000000004', TRUE, '2026-09-19T08:00:00Z', '2026-09-19T08:00:00Z', FALSE, 'NG', NULL),
        ('e0000000-0000-4000-8000-000000000005', FALSE, '2026-09-19T08:00:00Z', NULL, FALSE, '', NULL);
      INSERT INTO push_tokens (user_id, status, device_type, app_version) VALUES
        ('e0000000-0000-4000-8000-000000000001', 'active', 'ios', '2.4.6'),
        ('e0000000-0000-4000-8000-000000000002', 'inactive', 'android', '2.4.5'),
        ('e0000000-0000-4000-8000-000000000003', 'active', 'android', '2.4.6'),
        ('e0000000-0000-4000-8000-000000000004', 'active', 'ios', '2.4.5'),
        ('e0000000-0000-4000-8000-000000000001', 'active', NULL, '2.4.6');
      INSERT INTO feedback (type, rating, created_at) VALUES
        ('general', 5, '2026-09-16T08:00:00Z'),
        ('general', 3, '2026-09-17T08:00:00Z'),
        ('bug', 2, '2026-09-10T08:00:00Z'),
        ('feature', 1, '2026-09-19T08:00:00Z');

      INSERT INTO comments (id, moderation_status) VALUES
        ('f0000000-0000-4000-8000-000000000001', 'hidden'),
        ('f0000000-0000-4000-8000-000000000002', 'hidden'),
        ('f0000000-0000-4000-8000-000000000003', 'visible');
      INSERT INTO content_reports (id, status) VALUES
        ('f0000000-0000-4000-8000-000000000004', 'pending'),
        ('f0000000-0000-4000-8000-000000000005', 'resolved');
      INSERT INTO identity_checks (id, status) VALUES
        ('f0000000-0000-4000-8000-000000000006', 'In Review'),
        ('f0000000-0000-4000-8000-000000000007', 'In Progress'),
        ('f0000000-0000-4000-8000-000000000008', 'Approved');
      INSERT INTO giveaway_account_flags (id, trust_status, reviewed_by_id) VALUES
        ('f0000000-0000-4000-8000-000000000009', 'suspicious', NULL),
        ('f0000000-0000-4000-8000-000000000010', 'suspicious', 'd0000000-0000-4000-8000-000000000001'),
        ('f0000000-0000-4000-8000-000000000016', 'disqualified', NULL),
        ('f0000000-0000-4000-8000-000000000017', 'ok', NULL),
        ('f0000000-0000-4000-8000-000000000018', 'suspicious', NULL);
      INSERT INTO notifications (id, title, sent_at) VALUES
        ('f0000000-0000-4000-8000-000000000011', 'Morning brief', '2026-09-19T07:00:00Z'),
        ('f0000000-0000-4000-8000-000000000012', 'Old news', '2026-09-10T07:00:00Z'),
        ('f0000000-0000-4000-8000-000000000013', 'Evening', '2026-09-18T07:00:00Z');
      INSERT INTO notification_deliveries (notification_id, status, created_at) VALUES
        ('f0000000-0000-4000-8000-000000000011', 'delivered', '2026-09-19T07:01:00Z'),
        ('f0000000-0000-4000-8000-000000000011', 'delivered', '2026-09-19T07:01:00Z'),
        ('f0000000-0000-4000-8000-000000000011', 'opened', '2026-09-19T08:00:00Z'),
        ('f0000000-0000-4000-8000-000000000011', 'failed', '2026-09-19T07:01:00Z'),
        ('f0000000-0000-4000-8000-000000000013', 'delivered', '2026-09-18T07:01:00Z'),
        ('f0000000-0000-4000-8000-000000000013', 'delivered', '2026-09-18T07:01:00Z'),
        ('f0000000-0000-4000-8000-000000000013', 'delivered', '2026-09-18T07:01:00Z'),
        ('f0000000-0000-4000-8000-000000000012', 'failed', '2026-09-10T07:01:00Z'),
        ('f0000000-0000-4000-8000-000000000012', 'failed', '2026-09-01T07:01:00Z');
      INSERT INTO witness_reports (id, created_at) VALUES
        ('f0000000-0000-4000-8000-000000000014', '2026-09-18T08:00:00Z'),
        ('f0000000-0000-4000-8000-000000000015', '2026-08-01T08:00:00Z');
      INSERT INTO giveaways (id, name, status, start_date, end_date, total_valid_participants, draw_completed_at) VALUES
        ('e1000000-0000-4000-8000-000000000001', 'Weekly draw', 'active', '2026-09-14T08:00:00Z', '2026-09-28T08:00:00Z', 40, NULL),
        ('e1000000-0000-4000-8000-000000000009', 'Scheduled', 'active', '2026-09-22T08:00:00Z', '2026-09-29T08:00:00Z', NULL, NULL);
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
        ('e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', '${USER}', 'tier2', 'Headphones', 'unclaimed', 'on_hold', '2026-09-19T08:00:00Z'),
        ('e2000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000001', '${USER}', 'tier2', 'Headphones', 'disqualified', 'cancelled', '2026-09-19T07:00:00Z');
      INSERT INTO giveaway_fulfilment_attempts (winner_id, outcome, attempted_at) VALUES
        ('e2000000-0000-4000-8000-000000000001', 'sent', '2026-09-20T09:00:00Z'),
        ('e2000000-0000-4000-8000-000000000001', 'retryable_failure', '2026-09-20T09:30:00Z'),
        ('e2000000-0000-4000-8000-000000000002', 'sent', '2026-09-20T07:30:00Z'),
        ('e2000000-0000-4000-8000-000000000003', 'skipped', '2026-09-19T10:00:00Z'),
        -- a disqualified winner with two attempts: a join to attempts repeats the
        -- winner once per attempt, which a plain count would count twice
        ('e2000000-0000-4000-8000-000000000004', 'skipped', '2026-09-19T11:00:00Z'),
        ('e2000000-0000-4000-8000-000000000004', 'already_sent', '2026-09-19T12:00:00Z');
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
      // 4 of the 6 views follow an impression from the same device; the other
      // 2 are direct opens. The old definition (views per impression) read 120.
      matchedViews: 4,
      directOpens: 2,
      // 5 impressions on 3 device and article pairs, and each of the 3 was
      // opened. The earlier definitions read 120 (views per impression) and 80.
      exposures: 3,
      clickedExposures: 3,
      ctr: 100,
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

    // Both have three views; Squad named has three devices to Fuel price
    // review's two, so it ranks first by readers, the default.
    expect(top.map((t) => t.title)).toEqual([
      "Squad named",
      "Fuel price review",
    ]);
    expect(top.find((t) => t.title === "Fuel price review")).toMatchObject({
      category: "Energy",
      views: 3,
      readers: 2,
      publishedAt: "2026-09-12T08:00:00.000Z",
    });
    expect(cats.map((c) => c.category)).toEqual(["Energy", "Sports"]);
  });

  it("counts a view toward click-through only when its device saw the article first", async () => {
    // A period of its own, so the fixtures above are not disturbed.
    const earlier = resolveRange({
      days: 7,
      now: new Date("2026-07-31T10:00:00Z"),
    });
    await conn.unsafe(`
      INSERT INTO news_analytics (article_id, event, device_id, timestamp) VALUES
        ('${A1}', 'impression', 'm-a', '2026-07-30T10:00:00Z'),
        ('${A1}', 'view',       'm-a', '2026-07-30T10:01:00Z'),
        ('${A1}', 'view',       'm-b', '2026-07-30T10:00:00Z'),
        ('${A1}', 'impression', 'm-b', '2026-07-30T10:05:00Z'),
        ('${A1}', 'view',       'm-c', '2026-07-30T11:00:00Z')
    `);

    const { current } = await newsSummary(db, staff, { range: earlier });

    expect(current).toMatchObject({
      impressions: 2,
      views: 3,
      matchedViews: 1,
      directOpens: 2,
      exposures: 2,
      clickedExposures: 1,
      ctr: 50,
    });
    await conn.unsafe("DELETE FROM news_analytics WHERE device_id LIKE 'm-%'");
  });

  describe("top articles ranking", () => {
    // A window of its own (see the matched-views test above).
    const window = resolveRange({
      days: 7,
      now: new Date("2026-07-31T10:00:00Z"),
    });
    const at = (day: number, device: string, event: string, article: string) =>
      `('${article}', '${event}', '${device}', '2026-07-${day}T10:00:00Z')`;

    const seed = async (rows: string[]) =>
      await conn.unsafe(
        `INSERT INTO news_analytics (article_id, event, device_id, timestamp) VALUES ${rows.join(",")}`
      );
    const clean = async () =>
      await conn.unsafe(
        "DELETE FROM news_analytics WHERE device_id LIKE 'r-%'"
      );

    it("ranks by distinct readers, not raw views, and by views when asked", async () => {
      // A1: three devices, one view each. A2: one device, five views.
      await seed([
        at(30, "r-1", "view", A1),
        at(30, "r-2", "view", A1),
        at(30, "r-3", "view", A1),
        ...[1, 2, 3, 4, 5].map((_, i) => at(25 + i, "r-4", "view", A2)),
      ]);

      const byReaders = await newsTopArticles(db, staff, { range: window });
      const byViews = await newsTopArticles(db, staff, {
        range: window,
        sortBy: "views",
      });
      await clean();

      expect(byReaders.map((t) => t.id)).toEqual([A1, A2]);
      expect(byReaders[0]).toMatchObject({ readers: 3, views: 3 });
      expect(byReaders[1]).toMatchObject({ readers: 1, views: 5 });
      expect(byViews.map((t) => t.id)).toEqual([A2, A1]);
    });

    it("orders equal articles by id so the list never shuffles", async () => {
      await seed([at(30, "r-1", "view", A2), at(30, "r-2", "view", A1)]);
      const [first, second] = await newsTopArticles(db, staff, {
        range: window,
      });
      await clean();

      expect([first?.id, second?.id]).toEqual([A1, A2]);
    });

    it("puts a late spike above an evenly spread article under rising, and drops articles with under 3 views", async () => {
      // A1: 6 views on the last two days. A2: 6 views spread across the week.
      // The third article would score highest but has only 2 views.
      await seed([
        ...[0, 1, 2, 3, 4, 5].map((i) =>
          at(i < 3 ? 30 : 31, `r-${i}`, "view", A1)
        ),
        ...[25, 26, 27, 28, 29, 30].map((day, i) =>
          at(day, `r-1${i}`, "view", A2)
        ),
        at(31, "r-20", "view", A3),
        at(31, "r-21", "view", A3),
      ]);

      const rising = await newsTopArticles(db, staff, {
        range: window,
        sortBy: "rising",
      });
      await clean();

      expect(rising.map((t) => t.id)).toEqual([A1, A2]);
      expect(rising[0]?.trend).toBeGreaterThan(rising[1]?.trend ?? 0);
    });

    it("returns an empty list for every sort when nothing happened", async () => {
      for (const sortBy of [
        "readers",
        "reads",
        "views",
        "impressions",
        "rising",
      ] as const) {
        expect(
          await newsTopArticles(db, staff, { range: window, sortBy })
        ).toEqual([]);
      }
    });
  });

  it("never reports click-through above 100%, however often a reader reopens an article", async () => {
    const earlier = resolveRange({
      days: 7,
      now: new Date("2026-07-31T10:00:00Z"),
    });
    await conn.unsafe(`
      INSERT INTO news_analytics (article_id, event, device_id, timestamp) VALUES
        ('${A1}', 'impression', 'c-a', '2026-07-30T10:00:00Z'),
        ('${A1}', 'view',       'c-a', '2026-07-30T10:01:00Z'),
        ('${A1}', 'view',       'c-a', '2026-07-30T11:00:00Z'),
        ('${A1}', 'view',       'c-a', '2026-07-30T12:00:00Z'),
        ('${A1}', 'view',       'c-a', '2026-07-30T13:00:00Z'),
        -- seen before the period began, opened inside it: not this period's click
        ('${A1}', 'impression', 'c-b', '2026-07-10T10:00:00Z'),
        ('${A1}', 'view',       'c-b', '2026-07-30T10:00:00Z')
    `);

    const { current } = await newsSummary(db, staff, { range: earlier });
    const [top] = await newsTopArticles(db, staff, { range: earlier });
    await conn.unsafe("DELETE FROM news_analytics WHERE device_id LIKE 'c-%'");

    expect(current).toMatchObject({
      impressions: 1,
      views: 5,
      matchedViews: 4,
      directOpens: 1,
      exposures: 1,
      clickedExposures: 1,
      ctr: 100,
    });
    expect(top).toMatchObject({ id: A1, ctr: 100 });
  });

  it("counts events sent without an event id", async () => {
    const earlier = resolveRange({
      days: 7,
      now: new Date("2026-07-31T10:00:00Z"),
    });
    await conn.unsafe(`
      INSERT INTO news_analytics (article_id, event, device_id, event_id, timestamp) VALUES
        ('${A1}', 'view', 'q-a', 'evt-12345678', '2026-07-30T10:00:00Z'),
        ('${A1}', 'view', 'q-b', NULL, '2026-07-30T10:01:00Z'),
        ('${A1}', 'view', 'q-c', NULL, '2026-07-30T10:02:00Z')
    `);

    const quality = await newsEventQuality(db, staff, { range: earlier });
    await conn.unsafe("DELETE FROM news_analytics WHERE device_id LIKE 'q-%'");

    expect(quality).toEqual({ events: 3, eventsWithoutId: 2 });
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

  describe("audience", () => {
    const audience = { range, now: NOW };

    it("counts the audience without naming anyone", async () => {
      const summary = await audienceSummary(db, staff, audience);

      expect(summary).toEqual({
        registered: 4,
        newUsers: { current: 2, previous: 1 },
        active7: 2,
        active30: 3,
        emailVerified: 2,
        emailVerifiedRate: 50,
        pushEnabled: 2,
        pushRate: 50,
        guests: 1,
      });
    });

    it("fills each day with new signups", async () => {
      const days = await audienceDaily(db, staff, audience);

      expect(days).toHaveLength(7);
      expect(days.find((d) => d.date === "2026-09-15")).toEqual({
        date: "2026-09-15",
        newUsers: 1,
      });
      expect(days.find((d) => d.date === "2026-09-19")).toEqual({
        date: "2026-09-19",
        newUsers: 1,
      });
      expect(days.find((d) => d.date === "2026-09-14")).toEqual({
        date: "2026-09-14",
        newUsers: 0,
      });
    });

    it("splits active tokens by device and version", async () => {
      const devices = await audienceDevices(db, staff, audience);

      expect(devices.byType).toEqual([
        { label: "ios", tokens: 2 },
        { label: "android", tokens: 1 },
        { label: "unknown", tokens: 1 },
      ]);
      expect(devices.byVersion).toEqual([
        { label: "2.4.6", tokens: 3 },
        { label: "2.4.5", tokens: 1 },
      ]);
    });

    it("prefers the checked country and groups the rest", async () => {
      const countries = await audienceCountries(db, staff, audience);

      expect(countries).toEqual([
        { country: "GH", users: 1 },
        { country: "NG", users: 1 },
        { country: "unknown", users: 1 },
        { country: "US", users: 1 },
      ]);
    });

    it("averages feedback over the period only", async () => {
      const feedback = await feedbackSummary(db, staff, audience);

      expect(feedback.total).toBe(3);
      expect(feedback.average).toBe(3);
      expect(feedback.byType).toEqual([
        { type: "general", count: 2, average: 4 },
        { type: "feature", count: 1, average: 1 },
      ]);
    });
  });

  describe("attention", () => {
    it("counts every queue without naming anyone", async () => {
      const counts = await needsAttention(db, staff, { now: NOW });

      expect(counts).toEqual({
        commentsHidden: 2,
        reportsPending: 1,
        identityInReview: 1,
        flagsUnreviewed: 2,
        pushFailed: 1,
        witnessWeek: 1,
      });
    });

    it("rates the period's campaigns from their deliveries", async () => {
      const report = await pushReport(db, staff, { range });

      expect(report.campaigns.map((c) => c.title)).toEqual([
        "Morning brief",
        "Evening",
      ]);
      expect(report.campaigns[0]).toMatchObject({
        delivered: 2,
        opened: 1,
        failed: 1,
        total: 4,
        openedRate: 25,
      });
      expect(report.campaigns[1]).toMatchObject({
        title: "Evening",
        delivered: 3,
        opened: 0,
        total: 3,
        openedRate: 0,
      });
      // 5 delivered, 1 opened, 1 failed, out of 7 deliveries, over both campaigns.
      expect(report.totals).toEqual({
        campaigns: 2,
        delivered: 5,
        opened: 1,
        failed: 1,
        openedRate: 14.3,
        failedRate: 14.3,
      });
    });

    it("totals every campaign even when only some are listed", async () => {
      // Only the newest is listed; the totals still cover both.
      const report = await pushReport(db, staff, { range, limit: 1 });

      expect(report.campaigns.map((c) => c.title)).toEqual(["Morning brief"]);
      expect(report.totals).toMatchObject({
        campaigns: 2,
        delivered: 5,
        opened: 1,
        failed: 1,
      });
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
      expect(report.winners.total).toBe(4);
      expect(report.winners.byTier).toEqual([
        { tier: "tier1", winners: 2 },
        { tier: "tier2", winners: 2 },
      ]);
      expect(report.recentWinners.map((w) => w.prize)).toEqual([
        "Airtime 1GB",
        "Airtime 2GB",
        "Headphones",
        "Headphones",
      ]);
      expect(report.fulfilment).toEqual({
        sent: 2,
        alreadySent: 1,
        retryableFailures: 1,
        permanentFailures: 0,
        skipped: 2,
      });
      expect(report.attention).toEqual({
        onHold: 1,
        awaitingVerification: 0,
        // One disqualified winner, who has two fulfilment attempts: counted once.
        disqualified: 1,
        fulfilmentFailing: 1,
      });
      expect(JSON.stringify(report)).not.toContain(USER);
    });

    it("does not call a giveaway live before its start date", async () => {
      // Switched on (active) but opening on the 22nd; asked on the 20th.
      const report = await giveawayReport(
        db,
        staff,
        "e1000000-0000-4000-8000-000000000009",
        { range, now: NOW }
      );

      expect(report.state).toMatchObject({
        name: "Scheduled",
        phase: "pending",
        live: false,
        msToDraw: null,
        msToOpen: 165_600_000,
      });
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

    it("tells a partner how their postbacks are being received", async () => {
      const health = await partnerPostbackHealth(db, partner1, { range });

      // 7 in the period: 2 accepted, 1 reported failed, 1 repeat, 3 rejected.
      // The August one is outside it; the other partner's two are not theirs.
      expect(health).toEqual({
        total: 7,
        accepted: 2,
        failedReported: 1,
        duplicate: 1,
        rejected: 3,
        rejectedRate: 42.9,
        lastReceivedAt: "2026-09-20T08:00:00.000Z",
        rejectedReasons: [
          { reason: "signature does not match", count: 2 },
          { reason: "missing signature", count: 1 },
        ],
      });
    });

    it("shows staff every partner's postbacks together, or one on request", async () => {
      const all = await partnerPostbackHealth(db, staff, { range });
      const two = await partnerPostbackHealth(db, staff, {
        range,
        partnerId: P2,
      });

      expect(all).toMatchObject({ total: 9, accepted: 3, rejected: 4 });
      expect(all.rejectedReasons.map((r) => r.reason)).toEqual([
        "signature does not match",
        "missing signature",
        "partner has no webhook secret",
      ]);
      expect(two).toMatchObject({ total: 2, accepted: 1, rejected: 1 });
    });

    it("still reports the latest postback when the period is quiet", async () => {
      // A window with nothing in it, but the partner did post back before.
      const quiet = resolveRange({
        days: 7,
        now: new Date("2026-12-01T10:00:00Z"),
      });

      const health = await partnerPostbackHealth(db, partner1, {
        range: quiet,
      });

      expect(health.total).toBe(0);
      expect(health.rejectedRate).toBeNull();
      expect(health.lastReceivedAt).toBe("2026-09-20T08:00:00.000Z");
    });
  });
  describe("discover", () => {
    const evt = (
      event: string,
      device: string,
      at: string,
      extra: {
        section?: string;
        type?: string;
        item?: string;
        source?: string;
      } = {}
    ) =>
      `('${event}', ${extra.section ? `'${extra.section}'` : "NULL"}, ${extra.type ? `'${extra.type}'` : "NULL"}, ${extra.item ? `'${extra.item}'` : "NULL"}, ${extra.source ? `'${extra.source}'` : "NULL"}, 's-${device}', '${device}', '${at}')`;

    beforeAll(async () => {
      await conn.unsafe(`
        CREATE TYPE enum_discover_events_event AS ENUM('view','section','open','game_launch','game_blocked','game_report');
        CREATE TABLE discover_events (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          event enum_discover_events_event NOT NULL,
          section varchar, item_type varchar, item_id varchar, source varchar,
          user_id varchar, session_id varchar NOT NULL, device_id varchar NOT NULL,
          platform varchar, event_id varchar, dedupe_key varchar UNIQUE,
          timestamp timestamptz NOT NULL, received_at timestamptz);
        INSERT INTO discover_events (event, section, item_type, item_id, source, session_id, device_id, timestamp) VALUES
          ${[
            // This period (14-20 September): three devices open Discover.
            evt("view", "d1", "2026-09-19T09:00:00Z", { section: "all" }),
            evt("view", "d1", "2026-09-19T09:30:00Z", { section: "all" }),
            evt("view", "d2", "2026-09-19T10:00:00Z", { section: "games" }),
            evt("view", "d3", "2026-09-20T08:00:00Z", { section: "all" }),
            evt("section", "d1", "2026-09-19T09:01:00Z", { section: "games" }),
            evt("section", "d2", "2026-09-19T10:01:00Z", {
              section: "surveys",
            }),
            evt("open", "d1", "2026-09-19T09:02:00Z", {
              type: "game",
              item: "prism-match-3d",
              section: "games",
            }),
            evt("open", "d2", "2026-09-19T10:02:00Z", {
              type: "game",
              item: "2048",
              section: "games",
            }),
            evt("open", "d2", "2026-09-19T10:03:00Z", { type: "brands" }),
            evt("game_launch", "d1", "2026-09-19T09:03:00Z", {
              type: "game",
              item: "prism-match-3d",
            }),
            evt("game_launch", "d1", "2026-09-19T09:40:00Z", {
              type: "game",
              item: "prism-match-3d",
            }),
            evt("game_launch", "d2", "2026-09-19T10:04:00Z", {
              type: "game",
              item: "2048",
            }),
            evt("game_blocked", "d3", "2026-09-20T08:01:00Z", {
              type: "game",
              item: "2048",
              source: "age",
            }),
            evt("game_report", "d2", "2026-09-19T10:30:00Z", { item: "2048" }),
            // The period before (7-13 September): two devices.
            evt("view", "d1", "2026-09-10T09:00:00Z", { section: "all" }),
            evt("view", "d4", "2026-09-11T09:00:00Z", { section: "all" }),
            // Outside both windows.
            evt("view", "d9", "2026-08-01T09:00:00Z", { section: "all" }),
          ].join(",\n")};
      `);
    });

    it("counts devices that opened Discover, now and before", async () => {
      const summary = await discoverSummary(db, staff, { range });
      expect(summary.openers).toEqual({ current: 3, previous: 2 });
      expect(summary).toMatchObject({
        itemOpens: 3,
        gameLaunches: 3,
        gamesBlocked: 1,
        gameReports: 1,
      });
      expect(summary.reach).toBe(
        summary.readers === 0
          ? null
          : Math.round((3 / summary.readers) * 1000) / 10
      );
    });

    it("lists every section, counting a view and a switch as showing it", async () => {
      const sections = await discoverSections(db, staff, { range });
      expect(sections.map((s) => s.section)).toEqual([
        "all",
        "apps",
        "games",
        "books",
        "surveys",
      ]);
      // all: d1 twice + d3; games: d2 view + d1 switch; surveys: d2 switch.
      expect(sections.find((s) => s.section === "all")).toEqual({
        section: "all",
        views: 3,
        people: 2,
      });
      expect(sections.find((s) => s.section === "games")).toEqual({
        section: "games",
        views: 2,
        people: 2,
      });
      expect(sections.find((s) => s.section === "surveys")).toEqual({
        section: "surveys",
        views: 1,
        people: 1,
      });
      expect(sections.find((s) => s.section === "apps")).toEqual({
        section: "apps",
        views: 0,
        people: 0,
      });
    });

    it("counts what was opened, by kind and by person", async () => {
      const items = await discoverItems(db, staff, { range });
      expect(items.find((i) => i.type === "game")).toEqual({
        type: "game",
        opens: 2,
        people: 2,
      });
      expect(items.find((i) => i.type === "brands")).toEqual({
        type: "brands",
        opens: 1,
        people: 1,
      });
      expect(items.find((i) => i.type === "app")).toEqual({
        type: "app",
        opens: 0,
        people: 0,
      });
    });

    it("ranks games by launches", async () => {
      const games = await discoverGames(db, staff, { range });
      expect(games).toEqual([
        { game: "prism-match-3d", launches: 2, players: 1 },
        { game: "2048", launches: 1, players: 1 },
      ]);
    });

    it("gives one bar per day with empty days at zero", async () => {
      const days = await discoverDaily(db, staff, { range });
      expect(days).toHaveLength(7);
      expect(days.find((d) => d.date === "2026-09-19")?.openers).toBe(2);
      expect(days.find((d) => d.date === "2026-09-20")?.openers).toBe(1);
      expect(days.find((d) => d.date === "2026-09-15")?.openers).toBe(0);
    });
  });
});
