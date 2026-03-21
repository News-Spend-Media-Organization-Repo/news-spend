import {
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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

const NewsItemGoogleAds = memo(
  ({ item, index, tab, ref: parentRef }: NewsItemGoogleAdProp) => {
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(() => !!getCachedAd(tab, item.id));
    const [nativeAd, setNativeAd] = useState<NativeAd | null>(() =>
      getCachedAd(tab, item.id)
    );

    const loadingRef = useRef(loading);
    const loadedRef = useRef(loaded);
    const attemptsRef = useRef(0);
    loadingRef.current = loading;
    loadedRef.current = loaded;

    const loadAd = useCallback(() => {
      console.log("Load Ad called: ", item.id + " index: ", index);
      if (loadedRef.current || loadingRef.current) {
        return;
      }
      if (attemptsRef.current >= MAX_RETRIES) {
        console.warn(`[Ad] MAX RETRIES reached id=${item.id}`);
        return;
      }

      attemptsRef.current += 1;
      console.log(
        `[Ad] attempt ${attemptsRef.current}/${MAX_RETRIES} id=${item.id}`
      );
      setLoading(true);

      const timeout = setTimeout(() => {
        console.warn(
          `[Ad] TIMEOUT attempt=${attemptsRef.current} id=${item.id}`
        );
        setLoading(false);
        loadAd();
      }, 10_000);

      NativeAd.createForAdRequest(TestIds.NATIVE, {
        adChoicesPlacement: NativeAdChoicesPlacement.BOTTOM_RIGHT,
      })
        .then((ad) => {
          clearTimeout(timeout);
          attemptsRef.current = 0;
          setCachedAd(tab, item.id, ad);
          setNativeAd(ad);
          setLoaded(true);
          setLoading(false);
        })
        .catch((err) => {
          clearTimeout(timeout);
          console.error(
            `[Ad] ERROR attempt=${attemptsRef.current} id=${item.id}`,
            err
          );
          setLoading(false);
          loadAd();
        });
    }, []);

    useImperativeHandle(parentRef, () => ({
      loadAd,
      isAdLoaded: () => loadedRef.current,
    }));

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
      <NativeAdView
        nativeAd={nativeAd}
        style={{ width: "100%", minHeight: 90 }}
      >
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
                <Text
                  boc="$gray.50"
                  br="$1"
                  bw={1}
                  color="$s300"
                  fos={13}
                  h="auto"
                  px="$1"
                >
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
  }
);

NewsItemGoogleAds.displayName = "NewsItemGoogleAds";
export default NewsItemGoogleAds;
