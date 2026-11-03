jest.mock("#/hooks/usePartnerEvents", () => ({
  usePartnerEvents: () => ({ trackImpression: jest.fn() }),
}));
jest.mock("#/hooks/news/useImpressionViewability", () => ({
  IMPRESSION_VIEWABILITY_CONFIG: {
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 1000,
  },
}));

import { partnerContentRowId } from "../usePartnerImpressionViewability";

describe("partnerContentRowId", () => {
  it("reads the id of a partner content row", () => {
    expect(partnerContentRowId({ id: "book-1", type: "book" })).toBe("book-1");
  });

  it("ignores a Google ad row", () => {
    expect(partnerContentRowId({ id: "ad-1", type: "gAd" })).toBeUndefined();
  });

  it("ignores rows with no usable id", () => {
    expect(partnerContentRowId(null)).toBeUndefined();
    expect(partnerContentRowId({ title: "no id" })).toBeUndefined();
    expect(partnerContentRowId({ id: 42 })).toBeUndefined();
  });
});
