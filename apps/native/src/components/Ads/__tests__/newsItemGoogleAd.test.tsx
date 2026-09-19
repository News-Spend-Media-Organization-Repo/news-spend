import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockCreateForAdRequest = jest.fn();
const mockDestroy = jest.fn();

/** The item the mocked recycling hook should announce on mount. */
let mockCurrentItem: { id: string } = { id: "ad-0" };

// The component's collaborators, all of which reach for native modules.
jest.mock("react-native-google-mobile-ads", () => ({
  NativeAd: {
    createForAdRequest: (...args: unknown[]) => mockCreateForAdRequest(...args),
  },
  NativeAdChoicesPlacement: { BOTTOM_RIGHT: 1 },
  NativeAdView: ({
    children,
    onLayout,
    style,
  }: {
    children: React.ReactNode;
    onLayout?: (e: unknown) => void;
    style?: unknown;
  }) => {
    // Forwards the sizing props the component under test manages, so tests
    // can both drive measurements in (onLayout) and read the pin out
    // (style.height). The real view sizes itself natively; there is no
    // layout engine under jest, so nothing here measures on its own.
    const { View } = require("react-native");
    return (
      <View testID="native-ad-view" style={style} onLayout={onLayout}>
        {children}
      </View>
    );
  },
  NativeAsset: ({ children }: { children: React.ReactNode }) => children,
  NativeMediaView: (props: Record<string, unknown>) => {
    const { View } = require("react-native");
    return <View testID="native-media-view" {...props} />;
  },
  NativeAssetType: {
    ICON: "icon",
    HEADLINE: "headline",
    BODY: "body",
    STORE: "store",
    CALL_TO_ACTION: "cta",
  },
}));

jest.mock("#/lib/adsInit", () => ({
  initializeAdsWhenPermitted: () => Promise.resolve(),
}));

// ad-loader only reports load exhaustion through Sentry. The real SDK's ESM
// dependency chain cannot be transformed under jest (a pre-existing version
// skew between @sentry/react-native and the hoisted @sentry/core, unrelated
// to ads), so it stays out of the unit test.
jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

jest.mock("#/lib/adUnits", () => ({ adUnits: { native: "unit" } }));

// The heroui wrappers pull in the design system's own hooks and context; the
// ad's loading state machine is what is under test, not its typography.
jest.mock("../../heroui/text", () => ({
  Text: require("react-native").Text,
}));
jest.mock("../../heroui/image", () => ({
  Image: require("react-native").Image,
}));

/**
 * `useRecyclingEffect` is the component's only entry point into loading — it
 * fires on mount as well as on a genuine recycle. The real hook needs a
 * LegendList recycling context, so this stands in for both: it announces the
 * module-level item on mount and re-announces whenever a test swaps it,
 * which is what a cell recycle looks like to the component.
 */
jest.mock("@legendapp/list/react-native", () => {
  const { useEffect, useRef } = require("react");
  return {
    useRecyclingEffect: (fn: (args: unknown) => void) => {
      const announced = useRef<{ id: string } | null>(null);
      useEffect(() => {
        if (
          announced.current != null &&
          announced.current.id === mockCurrentItem.id
        ) {
          return;
        }
        announced.current = mockCurrentItem;
        fn({ item: mockCurrentItem, prevItem: null });
      });
    },
  };
});

import NewsItemGoogleAds from "../NewsItemGoogleAd";
import { clearTabAdCache } from "#/utils/ad-cache";

/** Let every pending promise callback run, then drain scheduled timers. */
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
};

describe("NewsItemGoogleAds", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCreateForAdRequest.mockReset();
    mockDestroy.mockReset();
    clearTabAdCache("test");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the ad once a request succeeds", async () => {
    mockCreateForAdRequest.mockResolvedValue({
      headline: "Buy this",
      body: "Really do",
      store: "Play",
      callToAction: "Install",
      icon: null,
      destroy: mockDestroy,
    });

    mockCurrentItem = { id: "ad-1" };
    render(<NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />);
    await flush();

    expect(screen.getByText("Buy this")).toBeTruthy();
  });

  it("collapses the slot instead of stranding an empty placeholder", async () => {
    // No-fill on every attempt: the common real-world case.
    mockCreateForAdRequest.mockRejectedValue(new Error("no fill"));

    mockCurrentItem = { id: "ad-2" };
    render(<NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />);
    await flush();

    // While retries are still pending the placeholder is correct: an ad is
    // still expected here.
    expect(screen.queryByText("Advertisement")).toBeTruthy();

    // Walk through the whole backoff schedule (1s, 3s, 9s).
    for (const delay of [1000, 3000, 9000]) {
      await advance(delay);
      await flush();
    }

    // Out of attempts. The slot must take up no space rather than showing a
    // labelled empty box for the rest of the list's life — the reported bug.
    expect(screen.queryByText("Advertisement")).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });

  it("spaces retries out instead of firing them back to back", async () => {
    mockCreateForAdRequest.mockRejectedValue(new Error("no fill"));

    mockCurrentItem = { id: "ad-3" };
    render(<NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />);
    await flush();

    // One attempt on mount, and no more until the backoff has elapsed.
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(1);

    await advance(999);
    await flush();
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(1);

    await advance(1);
    await flush();
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(2);
  });

  it("destroys an ad that arrives after its request was superseded", async () => {
    // Supersede by timeout: the loader gives each attempt 10s, and a timed
    // out request is not cancellable, so a late arrival belongs to nobody
    // and must be released rather than leaked onto the native side.
    let resolveAd: ((ad: unknown) => void) | undefined;
    mockCreateForAdRequest.mockReturnValue(
      new Promise((resolve) => {
        resolveAd = resolve;
      })
    );

    const view = (() => {
      mockCurrentItem = { id: "ad-4" };
      return render(
        <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
      );
    })();
    await flush();

    // The cell goes away with the request still in flight.
    view.unmount();

    // The attempt times out while the native request is still pending.
    await advance(10_000);
    await flush();

    // ...and only then does the orphaned native request settle.
    await act(async () => {
      resolveAd?.({ headline: "late", destroy: mockDestroy });
      await Promise.resolve();
    });

    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it("drops the pinned height when the cell recycles to a different ad", async () => {
    mockCreateForAdRequest.mockResolvedValue({
      headline: "Tall ad",
      body: "Body",
      store: "Play",
      callToAction: "Install",
      destroy: mockDestroy,
    });

    mockCurrentItem = { id: "ad-tall" };
    const view = render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();
    expect(screen.getByText("Tall ad")).toBeTruthy();

    // The slot measures tall — a bigger creative, a mid-layout measurement —
    // and pins the container to it.
    fireEvent(screen.getByTestId("native-ad-view"), "layout", {
      nativeEvent: { layout: { height: 400, width: 300, x: 0, y: 0 } },
    });
    expect(screen.getByTestId("native-ad-view").props.style.height).toBe(400);

    // The cell recycles to a different, compact ad.
    mockCreateForAdRequest.mockResolvedValue({
      headline: "Compact ad",
      body: "Small",
      store: "Play",
      callToAction: "Get",
      destroy: mockDestroy,
    });
    mockCurrentItem = { id: "ad-compact" };
    view.rerender(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();

    expect(screen.getByText("Compact ad")).toBeTruthy();
    // The stale pin is dropped so the new ad measures itself. Without the
    // reset it keeps the 400px box and floats in blank space below its
    // content — the reported rendering bug.
    expect(
      screen.getByTestId("native-ad-view").props.style.height
    ).toBeUndefined();
  });
});
