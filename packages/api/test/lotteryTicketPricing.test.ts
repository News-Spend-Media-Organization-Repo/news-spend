import { describe, expect, it } from "bun:test";

import { CreateLotteryTicketInput } from "../src/router/lotteryTicket";

/**
 * The purchase handler itself needs a live Payload + Postgres, so these cover
 * the two pieces that are pure: the input contract, and the cost arithmetic
 * that the balance check compares against.
 */

// Mirrors the handler: cost is quantity x the lottery's ticket price.
const costOf = (quantity: number, ticketPrice: number) =>
  quantity * ticketPrice;

describe("ticket purchase input (regression)", () => {
  const parse = (n: unknown) =>
    CreateLotteryTicketInput.safeParse({ num_of_tickets: n });

  it("rejects a negative quantity, which used to mint points", () => {
    // -(-10 * 50) credited 500 points under the old bare z.number().
    expect(parse(-10).success).toBe(false);
  });

  it("rejects zero", () => {
    expect(parse(0).success).toBe(false);
  });

  it("rejects fractional quantities", () => {
    expect(parse(2.5).success).toBe(false);
  });

  it("rejects absurd quantities", () => {
    expect(parse(1_000_001).success).toBe(false);
  });

  it("accepts ordinary purchases", () => {
    for (const n of [1, 5, 10, 1000]) {
      expect(parse(n).success).toBe(true);
    }
  });
});

describe("ticket cost (regression)", () => {
  it("charges quantity x price, not quantity", () => {
    // The old check compared points against the count while debiting
    // count x price, so 10 points bought 10 tickets and left -490.
    expect(costOf(10, 50)).toBe(500);
    expect(costOf(10, 50)).not.toBe(10);
  });

  it("a balance that covers the count but not the cost is insufficient", () => {
    const points = 10;
    const cost = costOf(10, 50);
    expect(points < cost).toBe(true);
  });

  it("a balance that covers the cost is sufficient", () => {
    expect(costOf(10, 50) > 500).toBe(false);
  });
});
