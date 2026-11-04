import { describe, expect, it } from "vitest";
import { GiveawayWinners } from "../GiveawayWinners";

// The six gift card fields live inside the "Gift card" collapsible, so collect
// names one level down into `fields` as well as at the top level.
const collectNames = (fields: unknown[]): string[] =>
  fields.flatMap((field) => {
    const f = field as { name?: string; fields?: unknown[] };
    return [
      ...(f.name ? [f.name] : []),
      ...(f.fields ? collectNames(f.fields) : []),
    ];
  });

const fieldNames = collectNames(GiveawayWinners.fields ?? []);

describe("GiveawayWinners gift card fields", () => {
  it.each([
    "giftCardCode",
    "giftCardPin",
    "giftCardRedemptionUrl",
    "giftCardInstructions",
    "giftCardTransactionId",
    "giftCardEmailSentAt",
  ])("exposes %s", (name) => {
    expect(fieldNames).toContain(name);
  });
});
