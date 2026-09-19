import { useRecyclingEffect } from "@legendapp/list/react-native";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  type NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from "react-native-google-mobile-ads";
import { getCachedAd } from "#/utils/ad-cache";
import { ensureNativeAdLoaded } from "#/utils/ad-loader";
import { nativeAdDiagnostics } from "#/utils/nativeAdDiagnostics";
import { SCREENSHOT_MODE } from "#/utils/screenshotMode";
import { Text } from "../heroui/text";

/**
 * Google will not serve video to a media view smaller than 120 in either
 * dimension (dp on Android, points on iOS), and the SDK warns that smaller
 * slots "will be demonetized". At 100 this placement was shutting out every
 * video creative, and the native ad validator flagged it on each ad. The size
 * is a policy floor, not a styling choice, so it applies to every ad rather
 * than only those that turn out to carry video.
 *
 * Two points over the floor, not on it. Measured on an iPhone 17 Pro the media
 * view was exactly 120 and the validator still said it was too small, while an
 * iPhone X with the same layout passed. Native frames are floats, so a value
 * that is nominally 120 can land a hair under, and a check that compares
 * strictly then fails on some devices and not others. A margin removes the
 * question.
 */
const MEDIA_SIZE = 122;

/**
 * Keeps every asset strictly inside the ad view instead of flush against its
 * edges. The same measurement showed the content row touching the ad view's
 * left, top and right edges exactly, and the validator's "Advertiser assets
 * outside native ad view" is a containment check: an asset that reaches the
 * boundary can land a fraction of a point past it. One point on every side is
 * invisible and takes the boundary out of play.
 */
const ASSET_INSET = 1;

/**
 * Space kept clear beneath the thumbnail for the SDK's AdChoices icon, which
 * ad-loader pins to the bottom-left corner of the ad view. Google's guidance
 * is to leave room in the chosen corner instead of letting the icon land on
 * the creative, where it can be hard to see. Reserving it as a minimum height
 * means a tall text column still gets its own height for free.
 */
const ADCHOICES_GUTTER = 20;
const MIN_AD_HEIGHT = MEDIA_SIZE + ADCHOICES_GUTTER + ASSET_INSET * 2;

export type NewsItemGoogleAdProp = {
  index: number;
  item: any;
  tab?: string;
  fromFallback?: boolean;
};

const NewsItemGoogleAds = memo(({ item, tab }: NewsItemGoogleAdProp) => {
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(() =>
    getCachedAd(tab, item.id)
  );
  const [failed, setFailed] = useState(false);
  // Measured once via onLayout below; see the comment there.
  const [adViewHeight, setAdViewHeight] = useState(0);

  /**
   * Bumped whenever this cell recycles to a different ad slot, so a load
   * that was in flight for the previous item can't overwrite state for the
   * new one once it finally settles.
   */
  const generationRef = useRef(0);

  // Loads (or re-uses a cached/in-flight load for) whichever ad slot this
  // cell currently represents. The actual request lives in ad-loader.ts,
  // shared with the feed's eager preload walk — most of the time this call
  // just awaits a request that's already in flight or already cached.
  const activateItem = useCallback(
    (activateId: string, activateTab?: string) => {
      const generation = ++generationRef.current;
      const cached = getCachedAd(activateTab, activateId);
      setFailed(false);
      // Drop any height pinned by the previous slot. The onLayout pin below
      // can only ever grow: once `height` is set, every later measurement
      // reports the pinned height back, so `measuredHeight !== adViewHeight`
      // is never true again and the container never shrinks. In a recycled
      // list that strands each compact ad inside the tallest box its cell
      // ever measured — content clustered at the top, AdChoices badge
      // floating in blank space below. Every activation re-measures fresh.
      setAdViewHeight(0);
      if (cached) {
        setNativeAd(cached);
        return;
      }
      setNativeAd(null);
      ensureNativeAdLoaded(activateTab, activateId).then((ad) => {
        // Superseded by a later recycle/unmount: this result belongs to a
        // slot this cell no longer represents.
        if (generationRef.current !== generation) {
          return;
        }
        if (ad) {
          setNativeAd(ad);
        } else {
          setFailed(true);
        }
      });
    },
    []
  );

  // Fires on mount AND on every genuine recycle to a different ad item —
  // in principle. Confirmed by a live cold-start repro that it sometimes
  // never fires at all: a slot rendered its initial "loading" placeholder
  // once and then nothing, ever. The plain useEffect below is the
  // fallback — React's own mount guarantee doesn't depend on this
  // library's recycling-detection internals.
  useRecyclingEffect(({ item: recycledItem, prevItem }) => {
    const recycled = recycledItem as { id: string };
    const prev = prevItem as { id: string } | null;
    const isSameItem = prev != null && prev.id === recycled.id;
    if (isSameItem) {
      return;
    }
    activateItem(recycled.id, tab);
  });

  const mountFallbackRan = useRef(false);
  useEffect(() => {
    if (mountFallbackRan.current) {
      return;
    }
    mountFallbackRan.current = true;
    if (nativeAd) {
      return;
    }
    activateItem(item.id, tab);
  }, []);

  // Nothing will ever fill this slot: take up no space at all. A placeholder
  // box reading "Advertisement" with nothing in it is worse than no box.
  if (failed && !nativeAd) {
    return null;
  }

  if (!nativeAd) {
    return (
      <View className="min-h-35 items-center justify-center bg-background px-2.5 opacity-60">
        <Text className="font-bold text-p-500">Advertisement</Text>
      </View>
    );
  }

  return (
    <NativeAdView
      nativeAd={nativeAd}
      onLayout={(e) => {
        // AdMob's native ad validator flags "advertiser assets outside
        // native ad view" whenever this container's resolved height has a
        // fractional pixel component — `minHeight` alone can leave it
        // measuring a hair short of its (auto-sized) children, which is
        // enough for the assets to read as spilling past the boundary.
        // Pinning to the ceil'd measured height fixes it.
        const measuredHeight = Math.ceil(e.nativeEvent.layout.height);
        if (measuredHeight !== adViewHeight) {
          setAdViewHeight(measuredHeight);
        }
        nativeAdDiagnostics.recordAdViewLayout(e.nativeEvent.layout, {
          hasVideoContent: nativeAd.mediaContent?.hasVideoContent ?? false,
          aspectRatio: nativeAd.mediaContent?.aspectRatio ?? null,
        });
      }}
      style={{
        height: adViewHeight || undefined,
        minHeight: adViewHeight ? undefined : MIN_AD_HEIGHT,
        padding: ASSET_INSET,
        width: "100%",
      }}
    >
      <View
        className="flex-row gap-4"
        onLayout={(e) =>
          nativeAdDiagnostics.recordContentLayout(e.nativeEvent.layout)
        }
      >
        {/*
          Placed like a NewsItem/NewsItemAd thumbnail, but larger: 120 is the
          smallest media view Google will serve video to (see MEDIA_SIZE). This ad is meant to read as a normal feed row, not stand
          out with its own banner layout. Media (not icon) is the thumbnail:
          AdMob requires every native ad to carry a media asset (one of
          three required assets alongside headline/CTA), so it's the one
          guaranteed to be there — this layout previously omitted it
          entirely, which was the dominant cause of "matched but never
          shown" (AdMob console: ~80-90% match rate, ~35-40% show rate).
        */}
        <NativeMediaView
          onLayout={(e) =>
            nativeAdDiagnostics.recordMediaLayout(e.nativeEvent.layout)
          }
          resizeMode="cover"
          style={{ borderRadius: 10, height: MEDIA_SIZE, width: MEDIA_SIZE }}
        />

        <View className="flex-1 justify-center gap-4">
          <View className="flex-row justify-between gap-2">
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text
                className="flex-1 font-bold text-p-500"
                ellipsizeMode="tail"
                numberOfLines={2}
              >
                {nativeAd.headline}
              </Text>
            </NativeAsset>
            <Text className="shrink-0 self-start rounded-sm border border-gray-50 px-1 text-s-300 text-xs">
              AD
            </Text>
          </View>

          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text ellipsizeMode="tail" numberOfLines={2}>
              {nativeAd.body}
            </Text>
          </NativeAsset>

          <View className="flex-row items-center justify-between">
            {nativeAd.store ? (
              <NativeAsset assetType={NativeAssetType.STORE}>
                <Text className="text-p-500">{nativeAd.store}</Text>
              </NativeAsset>
            ) : (
              <View />
            )}
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <Text className="rounded-full bg-s-300 px-2 py-1 text-white text-xs">
                {nativeAd.callToAction}
              </Text>
            </NativeAsset>
          </View>
        </View>
      </View>
    </NativeAdView>
  );
});

NewsItemGoogleAds.displayName = "NewsItemGoogleAds";

function NewsItemGoogleAdsGated(props: NewsItemGoogleAdProp) {
  if (SCREENSHOT_MODE) {
    return null;
  }
  return <NewsItemGoogleAds {...props} />;
}

export default NewsItemGoogleAdsGated;
