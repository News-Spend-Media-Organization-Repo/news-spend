import { beforeAll, describe, expect, test } from "bun:test";
import { sql } from "@payloadcms/db-postgres";
import type { BasePayload } from "payload";

import { getTestPayload } from "./helpers/testPayload";

let payload: BasePayload;

// The first boot pushes the whole schema, which takes far longer than the
// default hook timeout allows.
beforeAll(async () => {
  payload = await getTestPayload();
}, 180_000);

const DUPLICATE_KEY = /idempotencyKey/i;

const createBuyer = () => {
  const stamp = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  return payload.create({
    collection: "users",
    data: {
      name: "Ticket Buyer",
      username: `ticket_buyer_${stamp}`,
      email: `ticket_buyer_${stamp}@example.invalid`,
      wish: "Tickets to the show",
    },
  });
};

describe("ticket orders idempotency", () => {
  test("a second order with the same idempotency key is rejected", async () => {
    const buyer = await createBuyer();
    const idempotencyKey = crypto.randomUUID();

    await payload.create({
      collection: "ticket-orders",
      data: {
        user: buyer.id,
        clientRef: crypto.randomUUID(),
        idempotencyKey,
      },
    });

    const duplicate = payload.create({
      collection: "ticket-orders",
      data: {
        user: buyer.id,
        clientRef: crypto.randomUUID(),
        idempotencyKey,
      },
    });

    await expect(duplicate).rejects.toThrow(DUPLICATE_KEY);
  });

  test("the database itself refuses a racing duplicate", async () => {
    const buyer = await createBuyer();
    const idempotencyKey = crypto.randomUUID();

    const insert = (clientRef: string) =>
      payload.db.drizzle.execute(sql`
        INSERT INTO ticket_orders (user_id, client_ref, idempotency_key)
        VALUES (${buyer.id}, ${clientRef}, ${idempotencyKey})`);

    await insert(crypto.randomUUID());

    // Raw SQL skips Payload's pre-insert uniqueness check, so only the index
    // can stop the loser of a race.
    const error = (await Promise.resolve(insert(crypto.randomUUID())).catch(
      (caught: { cause?: { code?: string } }) => caught
    )) as { cause?: { code?: string } };

    expect(error.cause?.code).toBe("23505");
  });
});
