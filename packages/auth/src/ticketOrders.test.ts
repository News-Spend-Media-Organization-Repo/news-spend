import { describe, expect, it } from "bun:test";

import { anonymiseTicketBuyer } from "./ticketOrders";

function fakePool(present: boolean) {
  const calls: { sql: string; values?: unknown[] }[] = [];

  return {
    calls,
    pool: {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return { rows: [{ present }] };
      },
    },
  };
}

describe("anonymiseTicketBuyer", () => {
  it("nulls the buyer's personal fields for that user", async () => {
    const { calls, pool } = fakePool(true);

    await anonymiseTicketBuyer(pool as never, "user-1");

    expect(calls[1]?.sql).toBe(
      "UPDATE ticket_orders SET buyer_name = NULL, buyer_email = NULL, buyer_phone = NULL WHERE user_id = $1"
    );
    expect(calls[1]?.values).toEqual(["user-1"]);
  });

  it("does nothing when the table has not been migrated yet", async () => {
    const { calls, pool } = fakePool(false);

    await anonymiseTicketBuyer(pool as never, "user-1");

    expect(calls).toHaveLength(1);
  });
});
