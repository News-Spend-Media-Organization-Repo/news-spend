import { useRecyclingEffect } from "@legendapp/list/react-native";
import { memo, useCallback, useImperativeHandle, useRef, useState } from "react";
import {
  NativeAd,
  NativeAdChoicesPlacement,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  TestIds,
} from "react-native-google-mobile-ads";
import { getTokens, Stack, Text, XStack, YStack } from "tamagui";

import { Image } from "#/components/ui";
import { getCachedAd, setCachedAd } from "#/utils/ad-cache";

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

const NewsItemGoogleAds = memo(({ item, index, tab, ref: parentRef }: NewsItemGoogleAdProp) => {
  const [loading, setLoading] = useState(false);
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(() => getCachedAd(tab, item.id));

  // loadingRef is the source of truth — never synced from state, always set imperatively.
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
      console.warn(`[Ad] TIMEOUT attempt=${attemptsRef.current} id=${itemRef.current.id}`);
      loadingRef.current = false;
      setLoading(false);
      loadAd();
    }, 10_000);

    NativeAd.createForAdRequest(TestIds.NATIVE, {
      adChoicesPlacement: NativeAdChoicesPlacement.BOTTOM_RIGHT,
    })
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
        console.error(`[Ad] ERROR attempt=${attemptsRef.current} id=${itemRef.current.id}`, err);
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
      <Stack
        alignItems="center"
        backgroundColor="$background"
        justifyContent="center"
        minHeight={90}
        opacity={0.6}
        paddingHorizontal="$2.5"
      >
        <Text
          style={{
            color: getTokens().color.p500.val,
            fontFamily: "Inter-Bold",
          }}
        >
          Advertisement
        </Text>
      </Stack>
    );
  }

  return (
    <NativeAdView nativeAd={nativeAd} style={{ width: "100%", minHeight: 90 }}>
      <Stack gap="$2.5">
        <XStack gap="$4">
          {nativeAd.icon ? (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image
                borderRadius={10}
                height={100}
                source={{ uri: nativeAd.icon.url }}
                width={100}
              />
            </NativeAsset>
          ) : null}

          <YStack flex={1} gap="$2.5">
            <XStack jc="space-between">
              <NativeAsset assetType={NativeAssetType.HEADLINE}>
                <Text
                  style={{
                    color: getTokens().color.p500.val,
                    fontFamily: "Inter-Bold",
                  }}
                >
                  {nativeAd.headline}
                </Text>
              </NativeAsset>
              <Text boc="$gray.50" br="$1" bw={1} color="$s300" fos={13} h="auto" px="$1">
                AD
              </Text>
            </XStack>

            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text
                style={{
                  color: getTokens().color.p500.val,
                  fontFamily: "Inter-Medium",
                }}
              >
                {nativeAd.body}
              </Text>
            </NativeAsset>

            <XStack alignItems="center" jc="space-between">
              <NativeAsset assetType={NativeAssetType.STORE}>
                <Text
                  style={{
                    color: getTokens().color.p500.val,
                    fontFamily: "Inter-Medium",
                  }}
                >
                  {nativeAd.store}
                </Text>
              </NativeAsset>
              <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                <Text
                  br="$10"
                  px="$2"
                  py="$1"
                  style={{
                    color: "white",
                    fontFamily: "Inter-Medium",
                    backgroundColor: getTokens().color.s300.val,
                  }}
                >
                  {nativeAd.callToAction}
                </Text>
              </NativeAsset>
            </XStack>
          </YStack>
        </XStack>
      </Stack>
    </NativeAdView>
  );
});

NewsItemGoogleAds.displayName = "NewsItemGoogleAds";
export default NewsItemGoogleAds;
