import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { Dimensions, PixelRatio, Platform } from "react-native";

/**
 * Temporary: reports what the feed's native ad actually measures, from builds
 * that are not in the public's hands.
 *
 * The AdMob native ad validator flags "MediaView is too small for video" and
 * "Advertiser assets outside native ad view" on some devices (an iPhone 17 Pro)
 * and not others (an iPhone X) with the same layout, and the layout numbers
 * alone do not explain it. This records the sizes React Native laid out, and
 * whether the creative is a video, so the difference can be read from Sentry
 * instead of guessed at. Remove it once that is understood.
 *
 * An allowlist, not "anything but production": store builds report their Sentry
 * environment as "unknown", so their variant is not reliably "production".
 */
const REPORTING_VARIANTS = new Set(["preview", "beta", "development"]);

type Size = { width: number; height: number };

type CreativeInfo = {
  hasVideoContent: boolean;
  aspectRatio: number | null;
};

export function nativeAdDiagnosticsEnabled(): boolean {
  const variant = Constants.expoConfig?.extra?.variant;
  return typeof variant === "string" && REPORTING_VARIANTS.has(variant);
}

/**
 * Collects the media view's and the ad view's sizes, then sends one report per
 * kind of creative per launch: a video and a still image can differ, and one
 * of each is enough to compare.
 */
export function createNativeAdDiagnostics(
  report: (kind: string, details: Record<string, unknown>) => void,
  enabled: () => boolean = nativeAdDiagnosticsEnabled
) {
  const reported = new Set<string>();
  let media: Size | null = null;

  return {
    recordMediaLayout(size: Size) {
      media = size;
    },
    recordAdViewLayout(adView: Size, creative: CreativeInfo) {
      if (!(enabled() && media)) {
        return;
      }
      const kind = creative.hasVideoContent ? "video" : "image";
      if (reported.has(kind)) {
        return;
      }
      reported.add(kind);

      report(kind, {
        mediaView: media,
        adView,
        creative,
        os: `${Platform.OS} ${Platform.Version}`,
        pixelRatio: PixelRatio.get(),
        fontScale: PixelRatio.getFontScale(),
        window: Dimensions.get("window"),
      });
    },
  };
}

export const nativeAdDiagnostics = createNativeAdDiagnostics(
  (kind, details) => {
    Sentry.captureMessage(`native ad layout (${kind})`, {
      level: "info",
      tags: { native_ad_creative: kind },
      extra: details,
    });
  }
);
