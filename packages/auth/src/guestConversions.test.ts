import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";

import { recordGuestConversion } from "./guestConversions";

const link = {
  anonymousUser: {
    user: {
      id: "guest-1",
      createdAt: new Date("2026-09-01T09:00:00Z"),
    },
  },
  newUser: { user: { id: "user-1" } },
};

const UUID = /^[0-9a-f-]{36}$/;

const fakeDb = () => {
  const calls: { text: string; values: unknown[] }[] = [];
  return {
    calls,
    query: (text: string, values: unknown[]) => {
      calls.push({ text, values });
      return Promise.resolve();
    },
  };
};

describe("recordGuestConversion", () => {
  test("records the guest, the new user and when the guest signed up", async () => {
    const db = fakeDb();

    await recordGuestConversion(db, link);

    expect(db.calls).toHaveLength(1);
    const [call] = db.calls;
    expect(call?.text).toContain("INSERT INTO guest_conversions");
    expect(call?.text).toContain(
      "ON CONFLICT (anonymous_user_id, user_id) DO NOTHING"
    );
    const values = call?.values ?? [];
    expect(values[0]).toMatch(UUID);
    expect(values.slice(1, 4)).toEqual([
      "guest-1",
      "user-1",
      link.anonymousUser.user.createdAt,
    ]);
    expect(values[4]).toBeInstanceOf(Date);
    expect(values[5]).toBeInstanceOf(Date);
  });

  test("never throws when the insert fails", async () => {
    const db = {
      query: () => Promise.reject(new Error("database is down")),
    };

    await expect(recordGuestConversion(db, link)).resolves.toBeUndefined();
  });
});

const uri = process.env.TEST_DATABASE_URI;

describe.skipIf(!uri)("recordGuestConversion on Postgres", () => {
  const pool = new pg.Pool({ connectionString: uri });

  beforeAll(async () => {
    await pool.query("DROP TABLE IF EXISTS guest_conversions CASCADE");
    await pool.query(`
      CREATE TABLE guest_conversions (
        id uuid PRIMARY KEY,
        anonymous_user_id text NOT NULL,
        user_id text NOT NULL,
        guest_created_at timestamptz NOT NULL,
        converted_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX guest_conversions_pair
        ON guest_conversions (anonymous_user_id, user_id);
    `);
  });

  afterAll(async () => {
    await pool.query("DROP TABLE IF EXISTS guest_conversions CASCADE");
    await pool.end();
  });

  test("inserts one row for a pair, and the same pair again is a no-op", async () => {
    await recordGuestConversion(pool, link);
    await recordGuestConversion(pool, link);

    const { rows } = await pool.query(
      "SELECT anonymous_user_id, user_id FROM guest_conversions"
    );
    expect(rows).toEqual([{ anonymous_user_id: "guest-1", user_id: "user-1" }]);
  });
});
