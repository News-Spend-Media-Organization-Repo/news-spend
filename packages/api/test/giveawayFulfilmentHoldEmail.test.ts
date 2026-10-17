import { describe, expect, it } from "bun:test";
import { fulfilmentHoldEmail } from "@news-spend-media/payload/lib/giveaway/fulfilmentHoldEmail";

const base = {
  winnerName: "Ada",
  prizeName: "₦500 Airtime",
  amount: 500,
  reason: "Provider rejected the payout: INVALID_ACCOUNT_NUMBER",
  attemptReference: "w1:2",
  adminUrl: "https://example.com/admin/collections/giveaway-winners/w1",
};

describe("fulfilmentHoldEmail", () => {
  it("names the winner, the prize, the amount and the reason", () => {
    const { subject, html } = fulfilmentHoldEmail(base);

    expect(subject).toContain("₦500 Airtime");
    expect(html).toContain("Ada");
    expect(html).toContain("500");
    expect(html).toContain("INVALID_ACCOUNT_NUMBER");
    expect(html).toContain("w1:2");
  });

  it("escapes provider text rather than trusting it", () => {
    // The reason carries Reloadly's own strings, including operator names read
    // out of their catalogue. It is escaped before it reaches a mail body.
    const { html } = fulfilmentHoldEmail({
      ...base,
      reason: 'rejected <script>alert("x")</script>',
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits the amount and reference it was not given", () => {
    const { html } = fulfilmentHoldEmail({
      ...base,
      // The amount is only checkable with a prize name that does not itself
      // contain "500": the row must be the only place that number can come
      // from. The prize row is asserted present in the first test.
      prizeName: "Airtime",
      amount: null,
      attemptReference: null,
    });

    expect(html).not.toContain("500");
    expect(html).not.toContain("w1:2");
    // The reason is never optional: it is why the email exists.
    expect(html).toContain("INVALID_ACCOUNT_NUMBER");
  });
});
