import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";

import { recordGuestConversion, recordGuestCreated } from "./guestEvents";

const UUID = /^[0-9a-f-]{36}$/;
const createdAt = new Date("2026-09-01T09:00:00Z");

const guest = { id: "guest-1", createdAt, isAnonymous: true };
const registered = { id: "guest-1", createdAt, isAnonymous: false };

const link = {
  anonymousUser: { user: guest },
  newUser: { user: { id: "user-1", isAnonymous: false } },
};

const fakeDb = () => {
  const calls: { text: string; values: unknown[] }[] = [];
  const rows: unknown[][] = [];
  const seen = new Set<string>();
  return {
    calls,
    rows,
    query: (text: string, values: unknown[]) => {
      calls.push({ text, values });
      const key =
        values[1] === "created"
          ? `created:${values[2]}`
          : `converted:${values[2]}:${values[3]}`;
      if (seen.has(key)) {
        return Promise.resolve();
      }
      seen.add(key);
      rows.push(values);
      return Promise.resolve();
    },
  };
};

const failDb = {
  query: () => Promise.reject(new Error("database is down")),
};

describe("recordGuestCreated", () => {
  test("records the guest and when it signed up", async () => {
    const db = fakeDb();

    await recordGuestCreated(db, guest);

    expect(db.calls).toHaveLength(1);
    const [call] = db.calls;
    expect(call?.text).toContain("INSERT INTO guest_events");
    expect(call?.text).toContain("ON CONFLICT DO NOTHING");
    const values = call?.values ?? [];
    expect(values).toHaveLength(7);
    expect(values[0]).toMatch(UUID);
    expect(values.slice(1, 5)).toEqual(["created", "guest-1", null, createdAt]);
    expect(values[5]).toBeInstanceOf(Date);
    expect(values[6]).toBeInstanceOf(Date);
  });

  test("records the same guest once", async () => {
    const db = fakeDb();

    await recordGuestCreated(db, guest);
    await recordGuestCreated(db, guest);

    expect(db.calls).toHaveLength(2);
    expect(db.rows).toHaveLength(1);
  });

  test("writes nothing for a registered sign-up", async () => {
    const db = fakeDb();

    await recordGuestCreated(db, registered);

    expect(db.calls).toHaveLength(0);
  });

  test("never throws when the insert fails", async () => {
    await expect(recordGuestCreated(failDb, guest)).resolves.toBeUndefined();
  });
});

describe("recordGuestConversion", () => {
  test("records a registered user that is not the guest", async () => {
    const db = fakeDb();

    await recordGuestConversion(db, link);

    expect(db.calls).toHaveLength(1);
    const [call] = db.calls;
    expect(call?.text).toContain("INSERT INTO guest_events");
    expect(call?.text).toContain("ON CONFLICT DO NOTHING");
    const values = call?.values ?? [];
    expect(values).toHaveLength(7);
    expect(values[0]).toMatch(UUID);
    expect(values.slice(1, 5)).toEqual([
      "converted",
      "guest-1",
      "user-1",
      createdAt,
    ]);
    expect(values[5]).toBeInstanceOf(Date);
    expect(values[6]).toBeInstanceOf(Date);
  });

  test("writes nothing when the new user is the same guest", async () => {
    const db = fakeDb();

    await recordGuestConversion(db, {
      anonymousUser: { user: guest },
      newUser: { user: guest },
    });

    expect(db.calls).toHaveLength(0);
  });

  test("writes nothing when the new session is still anonymous", async () => {
    const db = fakeDb();

    await recordGuestConversion(db, {
      anonymousUser: { user: guest },
      newUser: { user: { id: "guest-2", isAnonymous: true } },
    });

    expect(db.calls).toHaveLength(0);
  });

  test("records the same pair once", async () => {
    const db = fakeDb();

    await recordGuestConversion(db, link);
    await recordGuestConversion(db, link);

    expect(db.calls).toHaveLength(2);
    expect(db.rows).toHaveLength(1);
  });

  test("never throws when the insert fails", async () => {
    await expect(recordGuestConversion(failDb, link)).resolves.toBeUndefined();
  });
});

const uri = process.env.TEST_DATABASE_URI;

describe.skipIf(!uri)("guest events on Postgres", () => {
  const pool = new pg.Pool({ connectionString: uri });

  beforeAll(async () => {
    await pool.query("DROP TABLE IF EXISTS guest_events CASCADE");
    await pool.query(`
      CREATE TABLE guest_events (
        id uuid PRIMARY KEY,
        kind varchar NOT NULL,
        anonymous_user_id varchar NOT NULL,
        user_id varchar,
        guest_created_at timestamptz NOT NULL,
        occurred_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL
      );
      CREATE UNIQUE INDEX guest_events_kind_anonymous
        ON guest_events (kind, anonymous_user_id);
      CREATE UNIQUE INDEX guest_events_pair
        ON guest_events (anonymous_user_id, user_id);
    `);
  });

  afterAll(async () => {
    await pool.query("DROP TABLE IF EXISTS guest_events CASCADE");
    await pool.end();
  });

  test("writes one created row and one converted row, each once", async () => {
    await recordGuestCreated(pool, guest);
    await recordGuestCreated(pool, guest);
    await recordGuestConversion(pool, link);
    await recordGuestConversion(pool, link);

    const { rows } = await pool.query(
      `SELECT kind, anonymous_user_id, user_id
       FROM guest_events ORDER BY kind`
    );
    expect(rows).toEqual([
      { kind: "converted", anonymous_user_id: "guest-1", user_id: "user-1" },
      { kind: "created", anonymous_user_id: "guest-1", user_id: null },
    ]);
  });
});
