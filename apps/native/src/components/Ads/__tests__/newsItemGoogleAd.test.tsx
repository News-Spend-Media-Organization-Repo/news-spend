import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockCreateForAdRequest = jest.fn();
const mockDestroy = jest.fn();

/** The item the component under test is rendered with. */
let mockCurrentItem: { id: string } = { id: "ad-0" };

// The partner fallback talks to the API; here it only needs to be visible.
jest.mock("../NewsItemFallbackAd", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: () => <View testID="partner-fallback" />,
  };
});

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
  addBreadcrumb: jest.fn(),
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

import * as Sentry from "@sentry/react-native";
import { clearTabAdCache } from "#/utils/ad-cache";
import NewsItemGoogleAds from "../NewsItemGoogleAd";

const sentryCaptureMessage = Sentry.captureMessage as jest.Mock;
const sentryAddBreadcrumb = Sentry.addBreadcrumb as jest.Mock;

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
    sentryCaptureMessage.mockClear();
    sentryAddBreadcrumb.mockClear();
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

  it("keeps the media view at Google's 120x120 floor", async () => {
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

    // The floor was originally what let video serve; video ads are now refused
    // outright (see ad-loader), so it no longer buys that. It is kept because it
    // is also what sizes the thumbnail within the row — shrinking it would
    // change the row's layout, which is not what this change set out to do.
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

  it("hands the slot to a partner ad instead of stranding an empty placeholder", async () => {
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
    // Google has nothing, so the slot is handed to a partner ad, not left empty.
    expect(screen.getByTestId("partner-fallback")).toBeTruthy();
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

  it("prefers a still ad over a video one", async () => {
    const adWith = (headline: string, hasVideoContent: boolean) => ({
      headline,
      advertiser: "Acme",
      body: "Body",
      store: "Play",
      callToAction: "Install",
      mediaContent: { aspectRatio: 1, hasVideoContent },
      destroy: mockDestroy,
    });
    mockCreateForAdRequest
      .mockResolvedValueOnce(adWith("Video ad", true))
      .mockResolvedValueOnce(adWith("Still ad", false));

    mockCurrentItem = { id: "ad-video" };
    await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();
    await advance(1000);
    await flush();

    expect(screen.getByText("Still ad")).toBeTruthy();
    expect(screen.queryByText("Video ad")).toBeNull();
    // The unused video was released, not leaked.
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it("shows the first video ad when no still one turns up", async () => {
    const videoWith = (headline: string) => ({
      headline,
      advertiser: "Acme",
      body: "Body",
      store: "Play",
      callToAction: "Install",
      mediaContent: { aspectRatio: 1, hasVideoContent: true },
      destroy: mockDestroy,
    });
    mockCreateForAdRequest
      .mockResolvedValueOnce(videoWith("Video 1"))
      .mockResolvedValueOnce(videoWith("Video 2"));

    mockCurrentItem = { id: "ad-all-video" };
    await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();
    await advance(1000);
    await flush();

    expect(screen.getByText("Video 1")).toBeTruthy();
    expect(screen.queryByText("Video 2")).toBeNull();
    // The extra video was released, not leaked.
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it("leaves a breadcrumb, not an issue, when fill is exhausted by no-fill", async () => {
    mockCreateForAdRequest.mockRejectedValue(
      new Error("[googleMobileAds/no-fill] No fill.")
    );

    mockCurrentItem = { id: "ad-nofill-report" };
    await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();
    await advance(1000);
    await flush();
    await advance(3000);
    await flush();

    // Google has nothing, so the slot is handed to a partner ad, not left empty.
    expect(screen.getByTestId("partner-fallback")).toBeTruthy();
    // Expected inventory outcome: no Sentry issue filed ...
    expect(sentryCaptureMessage).not.toHaveBeenCalled();
    // ... but context kept for a future real event.
    expect(sentryAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "ads",
        message: "gAd slot collapsed",
      })
    );
  });

  it("samples actionable failures (timeouts) instead of reporting every slot", async () => {
    mockCreateForAdRequest.mockRejectedValue(new Error("ad request timed out"));

    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);
    mockCurrentItem = { id: "ad-timeout-sampled" };
    await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();
    await advance(1000);
    await flush();
    await advance(3000);
    await flush();

    expect(sentryCaptureMessage).toHaveBeenCalledTimes(1);
    expect(sentryCaptureMessage).toHaveBeenCalledWith(
      "gAd failed after all retries",
      expect.objectContaining({ level: "warning" })
    );

    randomSpy.mockReturnValue(0.99);
    sentryCaptureMessage.mockClear();
    sentryAddBreadcrumb.mockClear();
    mockCurrentItem = { id: "ad-timeout-unsampled" };
    await render(
      <NewsItemGoogleAds index={0} item={mockCurrentItem} tab="test" />
    );
    await flush();
    await advance(1000);
    await flush();
    await advance(3000);
    await flush();

    expect(sentryCaptureMessage).not.toHaveBeenCalled();
    expect(sentryAddBreadcrumb).toHaveBeenCalledTimes(1);
    randomSpy.mockRestore();
  });
});
