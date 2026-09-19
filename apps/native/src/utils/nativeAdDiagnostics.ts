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
 * How long to wait after the last ad view layout before reporting. React Native
 * delivers a parent's layout event before its children's, so reporting on the
 * ad view's own event went out before the media view and content row had been
 * measured, and both read null. The ad view also lays out twice (once, then
 * again when its height is pinned), so the report waits for that to settle.
 */
const SETTLE_MS = 800;

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
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
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

      // Restarted on every layout, so the report carries the settled numbers.
      const previous = pending.get(kind);
      if (previous) {
        clearTimeout(previous);
      }
      pending.set(
        kind,
        setTimeout(() => {
          pending.delete(kind);
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
        }, SETTLE_MS)
      );
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
