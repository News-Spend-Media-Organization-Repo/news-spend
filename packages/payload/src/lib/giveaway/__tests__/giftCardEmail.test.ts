import { describe, expect, it, vi } from "vitest";
import { giftCardEmail, sendGiftCardEmail } from "../giftCardEmail";

const input = {
  prizeName: "Amazon Nigeria",
  code: "CARD-1",
  pin: "1234",
  redemptionUrl: "https://redeem",
  instructions: "Redeem on amazon.com",
};

describe("giftCardEmail", () => {
  it("uses the prize name in the subject", () => {
    expect(giftCardEmail(input).subject).toBe(
      "Your Amazon Nigeria gift card is ready"
    );
  });

  it("includes the code, PIN, URL and instructions", () => {
    const { html } = giftCardEmail(input);

    expect(html).toContain("CARD-1");
    expect(html).toContain("1234");
    expect(html).toContain("https://redeem");
    expect(html).toContain("Redeem on amazon.com");
  });

  it("escapes instructions that contain HTML", () => {
    const { html } = giftCardEmail({
      ...input,
      instructions: '<script>alert("x")</script>',
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("strips newlines from the prize name in the subject", () => {
    const { subject } = giftCardEmail({
      ...input,
      prizeName: "Amazon\r\nNigeria",
    });

    expect(subject).toBe("Your Amazon Nigeria gift card is ready");
    expect(subject).not.toContain("\n");
    expect(subject).not.toContain("\r");
  });
});

describe("sendGiftCardEmail", () => {
  it("sends to the recipient and returns true", async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const payload = { sendEmail, logger: { error: vi.fn() } };

    const sent = await sendGiftCardEmail(payload as never, {
      ...input,
      to: "u1@example.com",
    });

    expect(sent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      to: "u1@example.com",
      subject: "Your Amazon Nigeria gift card is ready",
    });
  });

  it("returns false and does not throw when sendEmail rejects", async () => {
    const sendEmail = vi.fn().mockRejectedValue(new Error("smtp unreachable"));
    const error = vi.fn();
    const payload = { sendEmail, logger: { error } };

    const sent = await sendGiftCardEmail(payload as never, {
      ...input,
      to: "u1@example.com",
    });

    expect(sent).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    // The code is never written to the log.
    expect(JSON.stringify(error.mock.calls[0])).not.toContain("CARD-1");
  });
});
