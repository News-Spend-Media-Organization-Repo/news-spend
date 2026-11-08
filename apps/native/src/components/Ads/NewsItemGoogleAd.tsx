import { memo, useEffect, useState } from "react";
import { View } from "react-native";
import {
  type NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from "react-native-google-mobile-ads";
import { getCachedAd, isCachedAdStale } from "#/utils/ad-cache";
import { ensureNativeAdLoaded } from "#/utils/ad-loader";
import { SCREENSHOT_MODE } from "#/utils/screenshotMode";
import { Text } from "../heroui/text";
import {
  AD_SLOT_HEIGHT,
  AdPlaceholder,
  ASSET_INSET,
  MEDIA_SIZE,
} from "./adSlot";
import NewsItemFallbackAd from "./NewsItemFallbackAd";

export type NewsItemGoogleAdProp = {
  index: number;
  item: any;
  tab?: string;
  fromFallback?: boolean;
};

const NewsItemGoogleAds = memo(({ item, tab }: NewsItemGoogleAdProp) => {
  /**
   * The ad is read from the cache by the slot's id on every render, rather
   * than copied into state when the cell is activated.
   *
   * With `recycleItems` one cell is reused for many ad slots, and the item
   * prop changes underneath it. Ad-as-state meant the first frame after a
   * recycle still painted the PREVIOUS slot's ad (the same ad showing twice,
   * briefly, then flipping), followed by a placeholder frame while the effect
   * caught up, then the real ad: the flash. Reading by id means the cell is
   * correct on the very render that receives the new item.
   */
  const slotId: string = item.id;

  // The ad a load settled with, kept with its slot. It is state (not just a
  // cache re-read) so React Compiler, which memoizes on a call's arguments,
  // cannot hold on to a pre-load null once the load finishes.
  const [loaded, setLoaded] = useState<{ id: string; ad: NativeAd } | null>(
    null
  );
  const nativeAd =
    getCachedAd(tab, slotId) ?? (loaded?.id === slotId ? loaded.ad : null);
  const [failedSlotId, setFailedSlotId] = useState<string | null>(null);
  // Height of the content row, remembered with the slot it was measured for so
  // it can never carry over to the next ad this cell is recycled into.
  // Measured on the row, NOT on the NativeAdView: a view pinned to its own
  // measurement can never report that its content has grown, so anything that
  // lays out later (a wrapped line, a late font, an asset arriving) spills
  // outside the ad view, which is the validator's "assets outside native ad
  // view". The row is never pinned, so it keeps reporting what it needs.
  const [content, setContent] = useState<{ id: string; height: number } | null>(
    null
  );
  const contentHeight = content?.id === slotId ? content.height : 0;

  useEffect(() => {
    // A stale ad is still on screen; carry on to fetch its replacement.
    if (getCachedAd(tab, slotId) && !isCachedAdStale(tab, slotId)) {
      return;
    }
    // A load for this slot — the feed's eager preload, or this one — may
    // already be in flight; ensureNativeAdLoaded joins it rather than
    // starting another.
    let cancelled = false;
    ensureNativeAdLoaded(tab, slotId).then((ad) => {
      // The cell was recycled to another slot, or went away, in the meantime.
      if (cancelled) {
        return;
      }
      if (ad) {
        setLoaded({ id: slotId, ad });
      } else {
        setFailedSlotId(slotId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tab, slotId]);

  // Google has nothing for this slot. Give it to a partner ad rather than
  // leaving a hole; if there is no partner ad either, it takes up no space. A
  // placeholder box reading "Advertisement" with nothing in it is worse than
  // no box, but the fallback holds this height while its own request is in
  // flight (see NewsItemFallbackAd), so the slot never collapses mid-load.
  if (!nativeAd && failedSlotId === slotId) {
    return <NewsItemFallbackAd slotId={slotId} />;
  }

  if (!nativeAd) {
    return <AdPlaceholder />;
  }

  return (
    <NativeAdView
      nativeAd={nativeAd}
      style={{
        // Always at least the content plus its inset, rounded UP to a whole
        // number. AdMob's validator measures containment against the ad
        // view's resolved frame, and a fractional height (auto-sized from
        // fractional text metrics) can read as a hair short of the children.
        // An integer floor at or above the content removes the question,
        // and unlike a pinned height it follows the content up and down.
        minHeight: Math.max(AD_SLOT_HEIGHT, contentHeight + ASSET_INSET * 2),
        width: "100%",
      }}
    >
      <View style={{ padding: ASSET_INSET }} testID="native-ad-inset">
        <View
          className="flex-row gap-4"
          onLayout={(e) => {
            const height = Math.ceil(e.nativeEvent.layout.height);
            setContent((prev) =>
              prev?.id === slotId && prev.height === height
                ? prev
                : { id: slotId, height }
            );
          }}
          testID="native-ad-content"
        >
          {/*
          Placed like a NewsItem/NewsItemAd thumbnail, but larger: 120 is the
          smallest media view Google will serve video to (see MEDIA_SIZE). This
          ad is meant to read as a normal feed row, not stand out with its own
          banner layout. Media (not icon) is the thumbnail:
          AdMob requires every native ad to carry a media asset (one of
          three required assets alongside headline/CTA), so it's the one
          guaranteed to be there — this layout previously omitted it
          entirely, which was the dominant cause of "matched but never
          shown" (AdMob console: ~80-90% match rate, ~35-40% show rate).
        */}
          <NativeMediaView
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
