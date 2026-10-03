import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockCreateForAdRequest = jest.fn();
const mockDestroy = jest.fn();

/** The item the component under test is rendered with. */
let mockCurrentItem: { id: string } = { id: "ad-0" };

// The component's collaborators, all of which reach for native modules.
jest.mock("react-native-google-mobile-ads", () => ({
  NativeAd: {
    createForAdRequest: (...args: unknown[]) => mockCreateForAdRequest(...args),
  },
  NativeAdChoicesPlacement: { BOTTOM_LEFT: 3, BOTTOM_RIGHT: 1 },
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
      <View onLayout={onLayout} style={style} testID="native-ad-view">
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

import { clearTabAdCache } from "#/utils/ad-cache";
import NewsItemGoogleAds from "../NewsItemGoogleAd";

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
    // Clear first: it destroys the previous test's cached ads, and those calls
    // must not be counted against this test.
    clearTabAdCache("test");
    mockCreateForAdRequest.mockReset();
    mockDestroy.mockReset();
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
    await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();

    expect(screen.getByText("Buy this")).toBeTruthy();
  });

  it("keeps the media view at Google's 120x120 floor so video can serve", async () => {
    mockCreateForAdRequest.mockResolvedValue({
      headline: "Buy this",
      body: "Really do",
      store: "Play",
      callToAction: "Install",
      icon: null,
      destroy: mockDestroy,
    });

    mockCurrentItem = { id: "ad-size" };
    await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();

    // Below 120 in either dimension Google serves no video to the slot. And
    // strictly above it: a nominal 120 measured 120 on an iPhone 17 Pro and was
    // still flagged, since native frames are floats and a strict check can
    // land either side of the line.
    const media = screen.getByTestId("native-media-view").props.style;
    expect(media.width).toBeGreaterThan(120);
    expect(media.height).toBeGreaterThan(120);
  });

  it("keeps the assets strictly inside the ad view, not flush with its edges", async () => {
    mockCreateForAdRequest.mockResolvedValue({
      headline: "Buy this",
      body: "Really do",
      store: "Play",
      callToAction: "Install",
      icon: null,
      destroy: mockDestroy,
    });

    mockCurrentItem = { id: "ad-inset" };
    await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();

    // The margin lives on a wrapper INSIDE the ad view. Padding on the
    // NativeAdView itself makes the library inset the native view while the
    // children keep their offsets, pushing the right edge of every asset one
    // point outside it.
    const adView = screen.getByTestId("native-ad-view").props.style;
    expect(adView.padding).toBeUndefined();
    const inset = screen.getByTestId("native-ad-inset").props.style;
    expect(inset.padding).toBeGreaterThanOrEqual(1);
  });

  it("reserves room under the thumbnail for the AdChoices icon", async () => {
    mockCreateForAdRequest.mockResolvedValue({
      headline: "Buy this",
      body: "Really do",
      store: "Play",
      callToAction: "Install",
      icon: null,
      destroy: mockDestroy,
    });

    mockCurrentItem = { id: "ad-gutter" };
    await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();

    // AdChoices is pinned bottom-left of the ad view; with a short text
    // column the row would otherwise end at the thumbnail and the icon would
    // sit on the creative.
    const media = screen.getByTestId("native-media-view").props.style;
    const adView = screen.getByTestId("native-ad-view").props.style;
    expect(adView.minHeight - media.height).toBeGreaterThanOrEqual(20);
  });

  it("collapses the slot instead of stranding an empty placeholder", async () => {
    // No-fill on every attempt: the common real-world case.
    mockCreateForAdRequest.mockRejectedValue(new Error("no fill"));

    mockCurrentItem = { id: "ad-2" };
    await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
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
    await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
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

    mockCurrentItem = { id: "ad-4" };
    const view = await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();

    // The cell goes away with the request still in flight.
    await view.unmount();

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

  it("sizes the ad view from its content and follows it down when the cell recycles", async () => {
    mockCreateForAdRequest.mockResolvedValue({
      headline: "Tall ad",
      body: "Body",
      store: "Play",
      callToAction: "Install",
      destroy: mockDestroy,
    });

    mockCurrentItem = { id: "ad-tall" };
    const view = await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();
    expect(screen.getByText("Tall ad")).toBeTruthy();

    // The content measures tall, fractionally. The ad view is raised to a
    // whole number at or above it, so every asset stays inside.
    await fireEvent(screen.getByTestId("native-ad-content"), "layout", {
      nativeEvent: { layout: { height: 399.4, width: 300, x: 0, y: 0 } },
    });
    expect(screen.getByTestId("native-ad-view").props.style.minHeight).toBe(
      402
    );

    // Content that grows later is followed, not frozen out.
    await fireEvent(screen.getByTestId("native-ad-content"), "layout", {
      nativeEvent: { layout: { height: 460, width: 300, x: 0, y: 0 } },
    });
    expect(screen.getByTestId("native-ad-view").props.style.minHeight).toBe(
      462
    );

    // The cell recycles to a different, compact ad.
    mockCreateForAdRequest.mockResolvedValue({
      headline: "Compact ad",
      body: "Small",
      store: "Play",
      callToAction: "Get",
      destroy: mockDestroy,
    });
    mockCurrentItem = { id: "ad-compact" };
    await view.rerender(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();

    expect(screen.getByText("Compact ad")).toBeTruthy();
    // The previous slot's size is dropped, so the new ad is not left floating
    // in blank space below its content.
    expect(screen.getByTestId("native-ad-view").props.style.minHeight).toBe(
      144 // MEDIA_SIZE 122 + AdChoices gutter 20 + 2 inset
    );
  });
  it("asks again instead of showing an ad another slot in the tab already shows", async () => {
    const adWith = (headline: string) => ({
      headline,
      advertiser: "Acme",
      body: "Body",
      store: "Play",
      callToAction: "Install",
      destroy: mockDestroy,
    });
    mockCreateForAdRequest
      .mockResolvedValueOnce(adWith("Same ad"))
      .mockResolvedValueOnce(adWith("Same ad"))
      .mockResolvedValueOnce(adWith("Different ad"));

    const first = { id: "ad-dup-1" };
    const second = { id: "ad-dup-2" };
    await render(
      <>
        <NewsItemGoogleAds index={0} item={first} tab="test" />
        <NewsItemGoogleAds index={1} item={second} tab="test" />
      </>
    );
    await flush();
    await advance(1000);
    await flush();

    expect(screen.getByText("Same ad")).toBeTruthy();
    expect(screen.getByText("Different ad")).toBeTruthy();
    // The repeat was released, not leaked.
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
