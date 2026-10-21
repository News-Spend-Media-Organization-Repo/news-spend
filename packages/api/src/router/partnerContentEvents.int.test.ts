import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  buildDeviceDailyCountQuery,
  buildPartnerEventsInsert,
  type PartnerEventRow,
} from "../lib/partnerEventsInsert";

/**
 * Against a real Postgres, because the thing under test is how ON CONFLICT
 * DO NOTHING behaves across two unique indexes and NULLs, which no stub shows.
 *
 * Skipped unless TEST_DATABASE_URI is set. Everything happens in a throwaway
 * schema that is dropped afterwards.
 */
const uri = process.env.TEST_DATABASE_URI;
const suite = uri ? describe : describe.skip;

const SCHEMA = `pev_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

suite("partner content events insert, against a real database", () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;

  const contentId = randomUUID();
  const partnerId = randomUUID();

  const row = (over: Partial<PartnerEventRow> = {}): PartnerEventRow => ({
    contentId,
    partnerId,
    event: "impression",
    surface: "homepage-trending-books",
    position: null,
    userId: null,
    sessionId: "sess-1",
    deviceId: `dev-${randomUUID()}`,
    platform: "ios",
    timestamp: new Date(),
    receivedAt: new Date(),
    eventId: null,
    dedupeKey: null,
    ...over,
  });

  const insert = async (...rows: PartnerEventRow[]) =>
    (await db.execute((await buildPartnerEventsInsert(rows)) as never)).rows
      .length;

  const countFor = async (deviceId: string) =>
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM partner_content_events WHERE device_id = $1",
        [deviceId]
      )
    ).rows[0]?.n;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: uri,
      max: 2,
      options: `-c search_path=${SCHEMA}`,
    });
    const setup = new Pool({ connectionString: uri, max: 1 });
    await setup.query(`CREATE SCHEMA ${SCHEMA}`);
    await setup.end();
    await pool.query(`
      CREATE TYPE enum_partner_content_events_event AS ENUM ('impression', 'click');
      CREATE TYPE enum_partner_content_events_platform AS ENUM ('android', 'ios', 'web');
      CREATE TABLE partner_content_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        content_id uuid NOT NULL,
        partner_id uuid NOT NULL,
        event enum_partner_content_events_event NOT NULL,
        surface varchar NOT NULL,
        position numeric,
        user_id varchar,
        session_id varchar NOT NULL,
        device_id varchar NOT NULL,
        platform enum_partner_content_events_platform,
        timestamp timestamptz NOT NULL,
        received_at timestamptz,
        event_id varchar,
        dedupe_key varchar,
        updated_at timestamptz DEFAULT now() NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL
      );
      CREATE UNIQUE INDEX partner_content_events_dedupe_key_idx ON partner_content_events (dedupe_key);
      CREATE UNIQUE INDEX "deviceId_eventId_1_idx" ON partner_content_events (device_id, event_id);
    `);
    db = drizzle(pool);
  });

  afterAll(async () => {
    if (!pool) {
      return;
    }
    await pool.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
    await pool.end();
  });

  test("stores a row with its columns", async () => {
    const deviceId = `dev-${randomUUID()}`;
    expect(
      await insert(
        row({ deviceId, userId: "u1", position: 3, eventId: "evt-12345678" })
      )
    ).toBe(1);
    const stored = (
      await pool.query(
        "SELECT user_id, position, platform, event, surface FROM partner_content_events WHERE device_id = $1",
        [deviceId]
      )
    ).rows[0];
    expect(stored).toMatchObject({
      user_id: "u1",
      platform: "ios",
      event: "impression",
      surface: "homepage-trending-books",
    });
    expect(Number(stored.position)).toBe(3);
  });

  test("the same event ids sent again insert nothing", async () => {
    const deviceId = `dev-${randomUUID()}`;
    const batch = [
      row({ deviceId, eventId: "evt-aaaaaaaa", event: "click" }),
      row({ deviceId, eventId: "evt-bbbbbbbb", event: "click" }),
    ];
    expect(await insert(...batch)).toBe(2);
    expect(await insert(...batch)).toBe(0);
    expect(await countFor(deviceId)).toBe(2);
  });

  test("another device may reuse an event id", async () => {
    const a = row({ eventId: "evt-shared01", event: "click" });
    const b = row({ eventId: "evt-shared01", event: "click" });
    expect(await insert(a)).toBe(1);
    expect(await insert(b)).toBe(1);
  });

  test("a second impression with the same dedupe key inserts nothing, even with a new event id", async () => {
    const deviceId = `dev-${randomUUID()}`;
    const dedupeKey = `imp:${deviceId}:sess-1:${contentId}:homepage-trending-books`;
    expect(
      await insert(row({ deviceId, eventId: "evt-first001", dedupeKey }))
    ).toBe(1);
    expect(
      await insert(row({ deviceId, eventId: "evt-second02", dedupeKey }))
    ).toBe(0);
    expect(await countFor(deviceId)).toBe(1);
  });

  test("a conflicting row in a batch does not stop the others", async () => {
    const deviceId = `dev-${randomUUID()}`;
    const dedupeKey = `imp:${deviceId}:s:${contentId}:homepage-trending-books`;
    await insert(row({ deviceId, dedupeKey }));
    expect(
      await insert(
        row({ deviceId, dedupeKey }),
        row({ deviceId, event: "click" }),
        row({ deviceId, event: "click" })
      )
    ).toBe(2);
  });

  test("the same row twice in one statement is stored once", async () => {
    const deviceId = `dev-${randomUUID()}`;
    const dedupeKey = `imp:${deviceId}:s:${contentId}:homepage-trending-books`;
    expect(
      await insert(row({ deviceId, dedupeKey }), row({ deviceId, dedupeKey }))
    ).toBe(1);
  });

  test("clicks with null dedupe keys and null event ids all insert", async () => {
    const deviceId = `dev-${randomUUID()}`;
    expect(await insert(row({ deviceId, event: "click" }))).toBe(1);
    expect(await insert(row({ deviceId, event: "click" }))).toBe(1);
    expect(
      await insert(
        row({ deviceId, event: "click" }),
        row({ deviceId, event: "click" })
      )
    ).toBe(2);
    expect(await countFor(deviceId)).toBe(4);
  });

  test("the daily count query counts the past day per device and ignores older rows", async () => {
    const busy = `dev-${randomUUID()}`;
    const quiet = `dev-${randomUUID()}`;
    await insert(
      row({ deviceId: busy, event: "click" }),
      row({ deviceId: busy, event: "click" }),
      row({ deviceId: quiet, event: "click" })
    );
    await pool.query(
      "UPDATE partner_content_events SET received_at = now() - interval '2 days' WHERE device_id = $1",
      [quiet]
    );
    const counted = await db.execute(
      (await buildDeviceDailyCountQuery([busy, quiet])) as never
    );
    expect(counted.rows).toEqual([{ device_id: busy, count: 2 }]);
  });
});
