import { describe, expect, it } from "vitest";
import { giftCardConfigurationError } from "../PrizeCatalogue";

describe("giftCardConfigurationError", () => {
  it("leaves non-gift-card prizes alone", () => {
    expect(giftCardConfigurationError({ fulfilmentType: "physical" })).toBe(
      true
    );
  });

  it("allows a legacy gift card with no Reloadly configuration", () => {
    expect(giftCardConfigurationError({ fulfilmentType: "gift_card" })).toBe(
      true
    );
  });

  it("requires a face value once a product is chosen", () => {
    expect(
      giftCardConfigurationError({
        fulfilmentType: "gift_card",
        reloadlyGiftCardProductId: 7,
      })
    ).toMatch(/face value/);
  });

  it("refuses a face value with no product", () => {
    expect(
      giftCardConfigurationError({
        fulfilmentType: "gift_card",
        reloadlyGiftCardUnitPrice: 5000,
      })
    ).toMatch(/product/);
  });

  it("accepts a product and a positive face value", () => {
    expect(
      giftCardConfigurationError({
        fulfilmentType: "gift_card",
        reloadlyGiftCardProductId: 7,
        reloadlyGiftCardUnitPrice: 5000,
      })
    ).toBe(true);
  });
});
