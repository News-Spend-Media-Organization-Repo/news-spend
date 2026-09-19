import { createNativeAdDiagnostics } from "../nativeAdDiagnostics";

// The real SDK's ESM dependency chain cannot be transformed under jest (see the
// same mock in the native ad component test); only the reporter is under test.
jest.mock("@sentry/react-native", () => ({ captureMessage: jest.fn() }));

const IMAGE = { hasVideoContent: false, aspectRatio: 1.9 };
const VIDEO = { hasVideoContent: true, aspectRatio: 1.78 };

describe("createNativeAdDiagnostics", () => {
  it("reports the media and ad view sizes with the creative", () => {
    const report = jest.fn();
    const diagnostics = createNativeAdDiagnostics(report, () => true);

    diagnostics.recordMediaLayout({ width: 120, height: 120 });
    diagnostics.recordAdViewLayout({ width: 378, height: 140 }, VIDEO);

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(
      "video",
      expect.objectContaining({
        mediaView: { width: 120, height: 120 },
        adView: { width: 378, height: 140 },
        creative: VIDEO,
      })
    );
  });

  it("reports once per kind of creative, so a video and an image can each be compared", () => {
    const report = jest.fn();
    const diagnostics = createNativeAdDiagnostics(report, () => true);
    diagnostics.recordMediaLayout({ width: 120, height: 120 });

    diagnostics.recordAdViewLayout({ width: 378, height: 140 }, IMAGE);
    diagnostics.recordAdViewLayout({ width: 378, height: 141 }, IMAGE);
    diagnostics.recordAdViewLayout({ width: 378, height: 140 }, VIDEO);

    expect(report.mock.calls.map(([kind]) => kind)).toEqual(["image", "video"]);
  });

  it("reports without a media or content measurement, which may never arrive", () => {
    const report = jest.fn();
    const diagnostics = createNativeAdDiagnostics(report, () => true);

    diagnostics.recordAdViewLayout({ width: 378, height: 140 }, IMAGE);

    expect(report).toHaveBeenCalledWith(
      "image",
      expect.objectContaining({
        mediaView: null,
        content: null,
        contentBottomPastAdView: null,
      })
    );
  });

  it("says how far the content reaches past the ad view, which is what the validator checks", () => {
    const report = jest.fn();
    const diagnostics = createNativeAdDiagnostics(report, () => true);
    diagnostics.recordContentLayout({ x: 0, y: 0, width: 378, height: 140.33 });

    diagnostics.recordAdViewLayout({ width: 378, height: 140 }, IMAGE);

    const details = report.mock.calls[0]?.[1];
    expect(details.contentBottomPastAdView).toBeCloseTo(0.33);
    expect(details.contentRightPastAdView).toBe(0);
  });

  it("reports nothing where it is not enabled", () => {
    const report = jest.fn();
    const diagnostics = createNativeAdDiagnostics(report, () => false);

    diagnostics.recordMediaLayout({ width: 120, height: 120 });
    diagnostics.recordAdViewLayout({ width: 378, height: 140 }, VIDEO);

    expect(report).not.toHaveBeenCalled();
  });
});
