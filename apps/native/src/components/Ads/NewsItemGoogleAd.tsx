import { useRecyclingEffect } from "@legendapp/list/react-native";
import {
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import {
  NativeAd,
  NativeAdChoicesPlacement,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
} from "react-native-google-mobile-ads";
import { initializeAdsWhenPermitted } from "#/lib/adsInit";
import { adUnits } from "#/lib/adUnits";
import { getCachedAd, setCachedAd } from "#/utils/ad-cache";
import { SCREENSHOT_MODE } from "#/utils/screenshotMode";
import { Image } from "../heroui/image";
import { Text } from "../heroui/text";

export type NewsItemGoogleAdProp = {
  index: number;
  item: any;
  tab?: string;
  fromFallback?: boolean;
  ref?: React.Ref<NewsItemGoogleAdRef>;
};

export type NewsItemGoogleAdRef = {
  loadAd: () => void;
  isAdLoaded: () => boolean;
};

const MAX_RETRIES = 3;

const NewsItemGoogleAds = memo(
  ({ item, index, tab, ref: parentRef }: NewsItemGoogleAdProp) => {
    const [loading, setLoading] = useState(false);
    const [nativeAd, setNativeAd] = useState<NativeAd | null>(() =>
      getCachedAd(tab, item.id)
    );

    // loadingRef is the source of truth: never synced from state, always set imperatively.
    // This ensures loadAd() guards are accurate even when called synchronously inside
    // useRecyclingEffect (before the async setLoading state update has re-rendered).
    const loadingRef = useRef(false);
    const loadedRef = useRef(!!getCachedAd(tab, item.id));
    const attemptsRef = useRef(0);
    const itemRef = useRef(item);
    const tabRef = useRef(tab);
    itemRef.current = item;
    tabRef.current = tab;

    const loadAd = useCallback(() => {
      if (loadedRef.current || loadingRef.current) {
        return;
      }
      if (attemptsRef.current >= MAX_RETRIES) {
        console.warn(`[Ad] MAX RETRIES reached id=${itemRef.current.id}`);
        return;
      }

      attemptsRef.current += 1;
      loadingRef.current = true;
      setLoading(true);

      const timeout = setTimeout(() => {
        console.warn(
          `[Ad] TIMEOUT attempt=${attemptsRef.current} id=${itemRef.current.id}`
        );
        loadingRef.current = false;
        setLoading(false);
        loadAd();
      }, 10_000);

      initializeAdsWhenPermitted()
        .then(() =>
          NativeAd.createForAdRequest(adUnits.native, {
            adChoicesPlacement: NativeAdChoicesPlacement.BOTTOM_RIGHT,
          })
        )
        .then((ad) => {
          clearTimeout(timeout);
          attemptsRef.current = 0;
          setCachedAd(tabRef.current, itemRef.current.id, ad);
          loadedRef.current = true;
          loadingRef.current = false;
          setNativeAd(ad);
          setLoading(false);
        })
        .catch((err) => {
          clearTimeout(timeout);
          console.error(
            `[Ad] ERROR attempt=${attemptsRef.current} id=${itemRef.current.id}`,
            err
          );
          loadingRef.current = false;
          setLoading(false);
          loadAd();
        });
    }, []);

    useImperativeHandle(parentRef, () => ({
      loadAd,
      isAdLoaded: () => loadedRef.current,
    }));

    // Fires on mount AND on every genuine recycle to a different ad item.
    // Guard with prevItem.id so re-renders of the same item don't retrigger.
    useRecyclingEffect(({ item: recycledItem, prevItem }) => {
      const isSameItem = prevItem != null && prevItem.id === recycledItem.id;
      if (isSameItem) {
        return;
      }

      const cached = getCachedAd(tabRef.current, recycledItem.id);
      attemptsRef.current = 0;
      loadedRef.current = !!cached;
      loadingRef.current = false;

      if (cached) {
        setNativeAd(cached as NativeAd);
        setLoading(false);
      } else {
        setLoading(true);
        loadAd();
      }
    });

    if (!nativeAd || loading) {
      return (
        <View className="min-h-22.5 items-center justify-center bg-background px-2.5 opacity-60">
          <Text className="font-bold text-p-500">Advertisement</Text>
        </View>
      );
    }

    return (
      <NativeAdView
        nativeAd={nativeAd}
        style={{ width: "100%", minHeight: 90 }}
      >
        <View className="gap-2.5">
          <View className="flex-row gap-4">
            {nativeAd.icon ? (
              <NativeAsset assetType={NativeAssetType.ICON}>
                <Image
                  className="size-25 rounded-lg"
                  source={{ uri: nativeAd.icon.url }}
                />
              </NativeAsset>
            ) : null}

            <View className="flex-1 gap-2.5">
              <View className="flex-1 flex-row justify-between">
                <NativeAsset assetType={NativeAssetType.HEADLINE}>
                  <Text className="font-bold text-p-500">
                    {nativeAd.headline}
                  </Text>
                </NativeAsset>
                <Text className="rounded-sm border border-gray-50 px-1 text-s-300 text-xs">
                  AD
                </Text>
              </View>

              <NativeAsset assetType={NativeAssetType.BODY}>
                <Text className="text-sm" numberOfLines={2}>
                  {nativeAd.body}
                </Text>
              </NativeAsset>

              <View className="flex-row items-center justify-between">
                <NativeAsset assetType={NativeAssetType.STORE}>
                  <Text className="font-medium text-gray-50">
                    {nativeAd.store}
                  </Text>
                </NativeAsset>
                <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                  <Text className="rounded-full bg-s-300 px-2 py-1 font-medium text-white text-xs">
                    {nativeAd.callToAction}
                  </Text>
                </NativeAsset>
              </View>
            </View>
          </View>
        </View>
      </NativeAdView>
    );
  }
);

NewsItemGoogleAds.displayName = "NewsItemGoogleAds";

function NewsItemGoogleAdsGated(props: NewsItemGoogleAdProp) {
  if (SCREENSHOT_MODE) {
    return null;
  }
  return <NewsItemGoogleAds {...props} />;
}

export default NewsItemGoogleAdsGated;
