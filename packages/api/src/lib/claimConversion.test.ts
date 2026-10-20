import { describe, expect, it } from "bun:test";
import {
  type CapturedQuery,
  createFakePayload,
  stubDrizzle,
} from "../test-utils";
import { claimConversion } from "./claimConversion";

const args = {
  conversionId: "c0000000-0000-4000-8000-000000000001",
  userId: "u0000000-0000-4000-8000-000000000001",
  contentId: "d0000000-0000-4000-8000-000000000001",
  partnerOrderId: "order-1",
};

const run = (siblingSettled: boolean, updated = true) => {
  const payload = createFakePayload();
  const drizzle = stubDrizzle(payload, (query) => {
    if (query.sql.includes("SELECT 1 FROM partner_conversions")) {
      return siblingSettled ? [{ "?column?": 1 }] : [];
    }
    if (query.sql.includes("UPDATE partner_conversions")) {
      return updated ? [{ id: args.conversionId }] : [];
    }
    return [];
  });
  return { payload, drizzle };
};

const updatesOf = (queries: CapturedQuery[]) =>
  queries.filter((q) => q.sql.includes("UPDATE partner_conversions"));

describe("claimConversion", () => {
  it("refuses, and writes nothing, when another conversion is already settled", async () => {
    const { payload, drizzle } = run(true);

    const claimed = await claimConversion(payload as never, args);

    expect(claimed).toBe(false);
    expect(updatesOf(drizzle.queries)).toHaveLength(0);
  });

  it("claims when no other conversion is settled", async () => {
    const { payload, drizzle } = run(false);

    const claimed = await claimConversion(payload as never, args);

    expect(claimed).toBe(true);
    expect(updatesOf(drizzle.queries)).toHaveLength(1);
  });

  it("takes the user-and-offer lock before it looks for a settled sibling", async () => {
    const { payload, drizzle } = run(false);

    await claimConversion(payload as never, args);

    const order = drizzle.queries.map((q) =>
      q.sql.includes("pg_advisory_xact_lock")
        ? "lock"
        : q.sql.includes("SELECT 1 FROM partner_conversions")
          ? "check"
          : q.sql.includes("UPDATE partner_conversions")
            ? "update"
            : "other"
    );
    expect(order).toEqual(["lock", "check", "update"]);
    // Keyed on both ids, bound as parameters rather than spliced in.
    expect(drizzle.queries[0]?.params).toEqual([args.userId, args.contentId]);
  });

  it("only moves a conversion that is still a click", async () => {
    const { payload, drizzle } = run(false);

    await claimConversion(payload as never, args);

    const update = updatesOf(drizzle.queries)[0];
    expect(update?.sql).toContain("status = 'clicked'");
    expect(update?.params).toEqual([args.partnerOrderId, args.conversionId]);
  });

  it("is not a claim when the conversion was no longer a click", async () => {
    const { payload } = run(false, false);

    expect(await claimConversion(payload as never, args)).toBe(false);
  });

  it("lets a database error propagate", async () => {
    const payload = createFakePayload();
    stubDrizzle(payload, () => {
      throw new Error("connection lost");
    });

    await expect(claimConversion(payload as never, args)).rejects.toThrow(
      "connection lost"
    );
  });
});
