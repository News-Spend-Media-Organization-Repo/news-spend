import { renderHook } from "@testing-library/react-native";

const mockTrackImpression = jest.fn();

jest.mock("#/hooks/news/useNewsAnalytics", () => ({
  useNewsAnalytics: () => ({ trackImpression: jest.fn() }),
}));
jest.mock("#/hooks/usePartnerEvents", () => ({
  usePartnerEvents: () => ({ trackImpression: mockTrackImpression }),
}));

import { IMPRESSION_VIEWABILITY_CONFIG } from "../useImpressionViewability";
import { usePartnerImpressionViewability } from "../usePartnerImpressionViewability";

type Token = {
  index: number;
  isViewable: boolean;
  item?: Record<string, unknown> | null;
};

const fire = (
  pairs: ReturnType<typeof usePartnerImpressionViewability>,
  changed: Token[]
) =>
  (pairs[0]?.onViewableItemsChanged as (info: { changed: Token[] }) => void)({
    changed,
  });

describe("usePartnerImpressionViewability", () => {
  beforeEach(() => mockTrackImpression.mockReset());

  it("uses the shared 50%-for-one-second standard and a stable reference", async () => {
    const { result, rerender } = await renderHook(() =>
      usePartnerImpressionViewability()
    );
    const first = result.current;
    expect(first[0]?.viewabilityConfig).toBe(IMPRESSION_VIEWABILITY_CONFIG);
    await rerender({});
    expect(result.current).toBe(first);
  });

  it("records a viewable in-house ad under the homepage ads placement", async () => {
    const { result } = await renderHook(() =>
      usePartnerImpressionViewability()
    );
    fire(result.current, [
      {
        index: 4,
        isViewable: true,
        item: { _type: "ad", type: "inHouse", payload: { id: "p1" } },
      },
    ]);
    expect(mockTrackImpression).toHaveBeenCalledTimes(1);
    expect(mockTrackImpression).toHaveBeenCalledWith(
      "p1",
      "homepage-ads-banner",
      4
    );
  });

  it("counts a promotion media row", async () => {
    const { result } = await renderHook(() =>
      usePartnerImpressionViewability()
    );
    fire(result.current, [
      {
        index: 2,
        isViewable: true,
        item: { _type: "promotionMedia", payload: { id: "promo1" } },
      },
    ]);
    expect(mockTrackImpression).toHaveBeenCalledWith(
      "promo1",
      "homepage-ads-banner",
      2
    );
  });

  it("ignores Google ads, articles, related news, non-viewable and id-less rows", async () => {
    const { result } = await renderHook(() =>
      usePartnerImpressionViewability()
    );
    fire(result.current, [
      {
        index: 0,
        isViewable: true,
        item: { _type: "ad", type: "gAd", payload: { id: "g", slot: "s" } },
      },
      { index: 1, isViewable: true, item: { type: "article", id: "n1" } },
      {
        index: 2,
        isViewable: true,
        item: { _type: "relatedNews", data: [{ id: "x" }] },
      },
      {
        index: 3,
        isViewable: false,
        item: { _type: "ad", type: "inHouse", payload: { id: "p2" } },
      },
      { index: 4, isViewable: true, item: { _type: "ad", type: "inHouse" } },
      { index: 5, isViewable: true, item: null },
    ]);
    expect(mockTrackImpression).not.toHaveBeenCalled();
  });
});
