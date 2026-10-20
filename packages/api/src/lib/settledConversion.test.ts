import { describe, expect, it } from "bun:test";
import type { BasePayload } from "payload";
import { createFakePayload } from "../test-utils";
import { hasSettledConversion } from "./settledConversion";

const row = (overrides: Record<string, unknown>) => ({
  id: "c1",
  user: "user-1",
  content: "pc1",
  status: "clicked",
  ...overrides,
});

const check = (rows: Record<string, unknown>[]) =>
  hasSettledConversion(
    createFakePayload({
      collections: { "partner-conversions": rows },
    }) as unknown as BasePayload,
    { userId: "user-1", contentId: "pc1" }
  );

describe("hasSettledConversion", () => {
  it("is true for a converted conversion", async () => {
    expect(await check([row({ status: "converted" })])).toBe(true);
  });

  it("is true for an awarded conversion", async () => {
    expect(await check([row({ status: "awarded" })])).toBe(true);
  });

  it("is false when the user has only clicked or failed", async () => {
    expect(
      await check([
        row({ status: "clicked" }),
        row({ id: "c2", status: "failed" }),
      ])
    ).toBe(false);
  });

  it("is false when another user settled it", async () => {
    expect(await check([row({ status: "awarded", user: "user-2" })])).toBe(
      false
    );
  });

  it("is false when the user settled a different item", async () => {
    expect(await check([row({ status: "awarded", content: "pc2" })])).toBe(
      false
    );
  });
});
