import { describe, expect, it } from "vitest";
import {
  giftCardConfigurationError,
  giftCardDenominationError,
} from "../PrizeCatalogue";

const FACE_VALUE_ERROR = /face value/;
const PRODUCT_ERROR = /product/;

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
    ).toMatch(FACE_VALUE_ERROR);
  });

  it("refuses a face value with no product", () => {
    expect(
      giftCardConfigurationError({
        fulfilmentType: "gift_card",
        reloadlyGiftCardUnitPrice: 5000,
      })
    ).toMatch(PRODUCT_ERROR);
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

describe("giftCardDenominationError", () => {
  const fixedProduct = {
    denominationType: "FIXED" as const,
    fixedRecipientDenominations: [5000, 10_000, 20_000],
    minRecipientDenomination: null,
    maxRecipientDenomination: null,
  };

  const rangeProduct = {
    denominationType: "RANGE" as const,
    fixedRecipientDenominations: null,
    minRecipientDenomination: 1000,
    maxRecipientDenomination: 50_000,
  };

  it("accepts a FIXED value the product lists", () => {
    expect(giftCardDenominationError(fixedProduct, 10_000)).toBe(true);
  });

  it("refuses a FIXED value and names the allowed values", () => {
    const error = giftCardDenominationError(fixedProduct, 4000);
    expect(error).not.toBe(true);
    expect(error).toContain("4000");
    expect(error).toContain("5000");
    expect(error).toContain("10");
    expect(error).toContain("20");
  });

  it("accepts a RANGE value at both bounds", () => {
    expect(giftCardDenominationError(rangeProduct, 1000)).toBe(true);
    expect(giftCardDenominationError(rangeProduct, 50_000)).toBe(true);
  });

  it("refuses a RANGE value outside the range", () => {
    const error = giftCardDenominationError(rangeProduct, 999);
    expect(error).not.toBe(true);
    expect(error).toContain("999");
    expect(error).toContain("1000");
    expect(error).toContain("50000");
  });

  it("returns true when the product has no usable denomination data", () => {
    expect(
      giftCardDenominationError(
        {
          denominationType: "FIXED",
          fixedRecipientDenominations: null,
          minRecipientDenomination: null,
          maxRecipientDenomination: null,
        },
        5000
      )
    ).toBe(true);
    expect(
      giftCardDenominationError(
        {
          denominationType: "RANGE",
          fixedRecipientDenominations: null,
          minRecipientDenomination: null,
          maxRecipientDenomination: null,
        },
        5000
      )
    ).toBe(true);
  });
});
