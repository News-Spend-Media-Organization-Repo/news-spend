/**
 * Google's "too many recently failed requests" throttle must end the retry
 * loop: a second attempt inside the window is refused and then times out,
 * which held the slot for ~9s and reported an actionable Sentry event for
 * normal AdMob cooldown (NEWS-SPEND-MEDIA-EA).
 */

const mockCreateForAdRequest = jest.fn();
const mockCaptureMessage = jest.fn();

jest.mock("react-native-google-mobile-ads", () => ({
  NativeAd: {
    createForAdRequest: (...args: unknown[]) => mockCreateForAdRequest(...args),
  },
  NativeAdChoicesPlacement: { BOTTOM_LEFT: 3 },
}));

jest.mock("#/lib/adsInit", () => ({
  initializeAdsWhenPermitted: () => Promise.resolve(),
}));

jest.mock("#/lib/adUnits", () => ({ adUnits: { native: "unit" } }));

jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));

jest.mock("#/utils/ad-cache", () => ({
  getCachedAd: () => undefined,
  isCachedAdStale: () => false,
  isDuplicateInTab: () => false,
  makeKey: (tab: string | undefined, id: string) => `${tab ?? ""}:${id}`,
  setCachedAd: jest.fn(),
}));

const RATE_LIMITED =
  "Too many recently failed requests for ad unit ID: 'unit'. You must wait a few seconds before making another ad request.";

describe("ad-loader", () => {
  beforeEach(() => {
    jest.resetModules();
    mockCreateForAdRequest.mockReset();
    mockCaptureMessage.mockReset();
  });

  it("does not retry a rate-limited request", async () => {
    mockCreateForAdRequest.mockRejectedValueOnce(new Error(RATE_LIMITED));
    const { ensureNativeAdLoaded } = require("#/utils/ad-loader");

    expect(await ensureNativeAdLoaded("latest", "slot-1")).toBeNull();
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(1);

    // The throttle is expected inventory behaviour, so no actionable event.
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});
