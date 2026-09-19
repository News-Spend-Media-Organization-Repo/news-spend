import * as Sentry from "@sentry/react-native";
import { Dimensions, PixelRatio, Platform } from "react-native";
import { currentBuildEnvironment } from "./buildEnvironment";

/**
 * Temporary: reports what the feed's native ad actually measures, from builds
 * that are not in the public's hands.
 *
 * The AdMob native ad validator flags "Advertiser assets outside native ad view"
 * (and, on some creatives, "MediaView is too small for video") on some devices
 * and not others with the same layout, and the layout numbers alone do not
 * explain it. This records the sizes React Native laid out and whether the
 * creative is a video, so the difference can be read from Sentry instead of
 * guessed at. Remove it once that is understood.
 *
 * Gated on the build's environment, resolved from the update channel. Gating on
 * the config variant does not work: an update carries the variant of whichever
 * machine published it, so an updated preview build reported a variant this
 * check did not recognise and sent nothing.
 */
export function nativeAdDiagnosticsEnabled(): boolean {
  const environment = currentBuildEnvironment();
  return environment === "staging" || environment === "development";
}

type Size = { width: number; height: number };
type Rect = Size & { x: number; y: number };

type CreativeInfo = {
  hasVideoContent: boolean;
  aspectRatio: number | null;
};

/**
 * Collects the media view's, the content row's and the ad view's layout, then
 * sends one report per kind of creative per launch: a video and a still image
 * can differ, and one of each is enough to compare.
 *
 * The media view and content row are best-effort. React Native may not deliver
 * a layout event for a native component, so a report goes out without them
 * (they read null) rather than not at all.
 */
export function createNativeAdDiagnostics(
  report: (kind: string, details: Record<string, unknown>) => void,
  enabled: () => boolean = nativeAdDiagnosticsEnabled
) {
  const reported = new Set<string>();
  let media: Size | null = null;
  let content: Rect | null = null;

  return {
    recordMediaLayout(size: Size) {
      media = size;
    },
    recordContentLayout(rect: Rect) {
      content = rect;
    },
    recordAdViewLayout(adView: Size, creative: CreativeInfo) {
      if (!enabled()) {
        return;
      }
      const kind = creative.hasVideoContent ? "video" : "image";
      if (reported.has(kind)) {
        return;
      }
      reported.add(kind);

      report(kind, {
        adView,
        content,
        mediaView: media,
        // What the validator checks: does anything reach past the ad view?
        contentBottomPastAdView: content
          ? content.y + content.height - adView.height
          : null,
        contentRightPastAdView: content
          ? content.x + content.width - adView.width
          : null,
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
