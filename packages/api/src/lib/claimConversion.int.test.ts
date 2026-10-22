import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { BasePayload } from "payload";
import { Pool } from "pg";
import { claimConversion } from "./claimConversion";

/**
 * Against a real Postgres, because the thing under test is a lock and
 * READ COMMITTED snapshots, which no stub can show.
 *
 * Skipped unless TEST_DATABASE_URI is set. Everything happens in a throwaway
 * schema that is dropped afterwards, so the database it points at is not
 * otherwise touched.
 */
const uri = process.env.TEST_DATABASE_URI;
const suite = uri ? describe : describe.skip;

const SCHEMA = `claim_conv_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

suite("claimConversion, against a real database", () => {
  let pool: Pool;
  let payload: BasePayload;

  const addConversion = async (userId: string, contentId: string) => {
    const id = randomUUID();
    await pool.query(
      "INSERT INTO partner_conversions (id, user_id, content_id) VALUES ($1, $2, $3)",
      [id, userId, contentId]
    );
    return id;
  };

  const statusOf = async (id: string) =>
    (
      await pool.query("SELECT status FROM partner_conversions WHERE id = $1", [
        id,
      ])
    ).rows[0]?.status;

  beforeAll(async () => {
    // Two or more connections, so two claims really do overlap.
    pool = new Pool({
      connectionString: uri,
      max: 6,
      options: `-c search_path=${SCHEMA}`,
    });
    const setup = new Pool({ connectionString: uri, max: 1 });
    await setup.query(`CREATE SCHEMA ${SCHEMA}`);
    await setup.end();
    await pool.query(`
      CREATE TYPE enum_status AS ENUM ('clicked', 'converted', 'awarded', 'failed');
      CREATE TABLE partner_conversions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        content_id uuid NOT NULL,
        status enum_status NOT NULL DEFAULT 'clicked',
        partner_order_id varchar,
        converted_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    payload = { db: { drizzle: drizzle(pool) } } as unknown as BasePayload;
  });

  afterAll(async () => {
    if (!pool) {
      return;
    }
    await pool.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
    await pool.end();
  });

  test("of two simultaneous claims for one person and offer, exactly one wins", async () => {
    // Repeated, because a missing lock only loses the race some of the time.
    for (let round = 0; round < 25; round += 1) {
      const userId = randomUUID();
      const contentId = randomUUID();
      const first = await addConversion(userId, contentId);
      const second = await addConversion(userId, contentId);

      const results = await Promise.all([
        claimConversion(payload, { conversionId: first, userId, contentId }),
        claimConversion(payload, { conversionId: second, userId, contentId }),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      const statuses = [await statusOf(first), await statusOf(second)];
      expect(statuses.filter((s) => s === "converted")).toHaveLength(1);
      expect(statuses.filter((s) => s === "clicked")).toHaveLength(1);
    }
  });

  test("refuses a later claim once one conversion is settled", async () => {
    const userId = randomUUID();
    const contentId = randomUUID();
    const first = await addConversion(userId, contentId);
    const second = await addConversion(userId, contentId);
    const third = await addConversion(userId, contentId);

    expect(
      await claimConversion(payload, {
        conversionId: first,
        userId,
        contentId,
        partnerOrderId: "order-1",
      })
    ).toBe(true);
    expect(
      await claimConversion(payload, {
        conversionId: second,
        userId,
        contentId,
      })
    ).toBe(false);
    expect(
      await claimConversion(payload, {
        conversionId: third,
        userId,
        contentId,
      })
    ).toBe(false);

    const winner = await pool.query(
      "SELECT status, partner_order_id, converted_at FROM partner_conversions WHERE id = $1",
      [first]
    );
    expect(winner.rows[0]?.status).toBe("converted");
    expect(winner.rows[0]?.partner_order_id).toBe("order-1");
    expect(winner.rows[0]?.converted_at).not.toBeNull();
    expect(await statusOf(second)).toBe("clicked");
  });

  test("does not let one person's claim block another person's, or another offer's", async () => {
    const contentId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();
    const a = await addConversion(userA, contentId);
    const b = await addConversion(userB, contentId);
    const otherOffer = randomUUID();
    const c = await addConversion(userA, otherOffer);

    const results = await Promise.all([
      claimConversion(payload, { conversionId: a, userId: userA, contentId }),
      claimConversion(payload, { conversionId: b, userId: userB, contentId }),
      claimConversion(payload, {
        conversionId: c,
        userId: userA,
        contentId: otherOffer,
      }),
    ]);

    expect(results).toEqual([true, true, true]);
  });

  test("claims a conversion the partner first reported failed", async () => {
    const userId = randomUUID();
    const contentId = randomUUID();
    const id = await addConversion(userId, contentId);
    await pool.query(
      "UPDATE partner_conversions SET status = 'failed' WHERE id = $1",
      [id]
    );

    expect(
      await claimConversion(payload, { conversionId: id, userId, contentId })
    ).toBe(true);
    expect(await statusOf(id)).toBe("converted");
  });

  test("does not claim a conversion that is already settled", async () => {
    const userId = randomUUID();
    const contentId = randomUUID();
    const id = await addConversion(userId, contentId);
    await pool.query(
      "UPDATE partner_conversions SET status = 'awarded' WHERE id = $1",
      [id]
    );

    expect(
      await claimConversion(payload, { conversionId: id, userId, contentId })
    ).toBe(false);
    expect(await statusOf(id)).toBe("awarded");
  });
});
