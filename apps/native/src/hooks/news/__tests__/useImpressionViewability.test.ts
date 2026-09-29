import { renderHook } from "@testing-library/react-native";

const mockTrackImpression = jest.fn();

jest.mock("#/hooks/news/useNewsAnalytics", () => ({
  useNewsAnalytics: () => ({ trackImpression: mockTrackImpression }),
}));

import {
  IMPRESSION_VIEWABILITY_CONFIG,
  useImpressionViewability,
} from "../useImpressionViewability";

const onChanged = (pairs: ReturnType<typeof useImpressionViewability>) =>
  pairs[0]?.onViewableItemsChanged as (info: {
    changed: {
      index: number;
      isViewable: boolean;
      item?: { id?: string; slug?: string | null } | null;
    }[];
  }) => void;

describe("useImpressionViewability", () => {
  beforeEach(() => mockTrackImpression.mockReset());

  it("uses the shared 50%-for-one-second standard", async () => {
    const { result } = await renderHook(() =>
      useImpressionViewability("HomeTrending")
    );

    expect(result.current[0]?.viewabilityConfig).toBe(
      IMPRESSION_VIEWABILITY_CONFIG
    );
    expect(IMPRESSION_VIEWABILITY_CONFIG).toEqual({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 1000,
    });
  });

  it("records each newly viewable article under the list's screen name", async () => {
    const { result } = await renderHook(() =>
      useImpressionViewability("HomeTrending")
    );

    onChanged(result.current)({
      changed: [
        { index: 0, isViewable: true, item: { id: "a", slug: "a-slug" } },
        { index: 1, isViewable: true, item: { id: "b", slug: null } },
      ],
    });

    expect(mockTrackImpression).toHaveBeenCalledTimes(2);
    expect(mockTrackImpression).toHaveBeenNthCalledWith(
      1,
      { id: "a", slug: "a-slug" },
      0,
      "HomeTrending"
    );
    expect(mockTrackImpression).toHaveBeenNthCalledWith(
      2,
      { id: "b", slug: null },
      1,
      "HomeTrending"
    );
  });

  it("ignores items that left view or carry no id", async () => {
    const { result } = await renderHook(() =>
      useImpressionViewability("HomeTrending")
    );

    onChanged(result.current)({
      changed: [
        { index: 0, isViewable: false, item: { id: "a" } },
        { index: 1, isViewable: true, item: {} },
        { index: 2, isViewable: true, item: null },
      ],
    });

    expect(mockTrackImpression).not.toHaveBeenCalled();
  });

  it("hands the list the same reference on every render", async () => {
    const { result, rerender } = await renderHook(() =>
      useImpressionViewability("HomeTrending")
    );
    const first = result.current;

    await rerender({});

    expect(result.current).toBe(first);
  });
});
