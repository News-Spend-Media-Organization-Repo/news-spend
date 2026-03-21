import { useEffect } from "react";
import { Image, Text, View } from "react-native";
import {
  type NativeAd,
  NativeAdEventType,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from "react-native-google-mobile-ads";
import { getTokens, Separator, Spinner, Square, Stack } from "tamagui";

const NativeNewsOpenAd = ({
  nativeAd,
  loading,
  error,
}: {
  nativeAd: NativeAd | undefined;
  loading: boolean;
  error: boolean;
}) => {
  const tokens = getTokens();

  useEffect(() => {
    if (!nativeAd) {
      return;
    }
    nativeAd.addAdEventListener(NativeAdEventType.IMPRESSION, () => {
      console.debug("Native ad impression");
    });
    nativeAd.addAdEventListener(NativeAdEventType.CLICKED, () => {
      console.debug("Native ad clicked");
    });
    nativeAd.addAdEventListener(NativeAdEventType.VIDEO_PLAYED, () => {
      console.debug("Native ad video played");
    });
    nativeAd.addAdEventListener(NativeAdEventType.VIDEO_PAUSED, () => {
      console.debug("Native ad video paused");
    });
    nativeAd.addAdEventListener(NativeAdEventType.VIDEO_ENDED, () => {
      console.debug("Native ad video ended");
    });
    nativeAd.addAdEventListener(NativeAdEventType.VIDEO_MUTED, () => {
      console.debug("Native ad video muted");
    });
    nativeAd.addAdEventListener(NativeAdEventType.VIDEO_UNMUTED, () => {
      console.debug("Native ad video unmuted");
    });
    return () => nativeAd.destroy();
  }, [nativeAd]);

  if (!nativeAd) {
    return (
      <>
        {loading && !error ? (
          <Square
            bg="$background"
            borderTopLeftRadius={10}
            borderTopRightRadius={10}
            gap="$9"
            h="100%"
            py="$2"
            zi="$3"
          >
            <Text style={{ textAlign: "center", fontFamily: "Inter-Medium" }}>
              Advertisement
            </Text>
            <Spinner />
          </Square>
        ) : null}

        {/* {error ? <CustomNewsOpenAd /> : null} */}
      </>
    );
  }

  return (
    <NativeAdView
      nativeAd={nativeAd}
      style={{
        zIndex: 3,
        backgroundColor: "white",
        borderTopRightRadius: 20,
        borderTopLeftRadius: 20,
        overflow: "hidden",
        height: "100%",
      }}
    >
      <Text
        style={{
          textAlign: "center",
          fontFamily: "Inter-Medium",
          paddingTop: 8,
          paddingBottom: 16,
          paddingHorizontal: 8,
        }}
      >
        Advertisement
      </Text>

      <Stack minHeight={200} px={8}>
        <NativeMediaView />
        <Text
          style={{
            borderColor: tokens.color.$p400.val,
            borderRadius: 3,
            borderWidth: 1,
            alignSelf: "flex-start",
            paddingHorizontal: 1,
            fontFamily: "Inter-Medium",
            marginVertical: 12,
          }}
        >
          Ad
        </Text>
      </Stack>

      <Stack gap={8} jc="flex-start" px={8}>
        <View style={{ padding: 16, gap: 8 }}>
          <View
            style={{ alignItems: "center", gap: 8, justifyContent: "center" }}
          >
            {nativeAd.icon && (
              <NativeAsset assetType={NativeAssetType.ICON}>
                <Image
                  height={100}
                  source={{ uri: nativeAd.icon.url }}
                  width={100}
                />
              </NativeAsset>
            )}
            {nativeAd.advertiser && (
              <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                <Text
                  style={{ fontFamily: "Inter-Medium", textAlign: "center" }}
                >
                  {nativeAd.advertiser}
                </Text>
              </NativeAsset>
            )}
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text
                style={{
                  fontSize: 18,
                  textAlign: "center",
                  fontFamily: "Inter-Bold",
                }}
              >
                {nativeAd.headline}
              </Text>
            </NativeAsset>
          </View>
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text style={{ fontFamily: "Inter-Medium", textAlign: "center" }}>
              {nativeAd.body}
            </Text>
          </NativeAsset>
        </View>
      </Stack>
      <Separator bw={0} my="$1.5" />
      <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
        <Text
          style={{
            color: "white",
            fontFamily: "Inter-Medium",
            backgroundColor: tokens.color.p300.val,
            paddingHorizontal: 28,
            paddingVertical: 14,
            borderRadius: 15,
            textAlign: "center",
            marginHorizontal: 16,
          }}
        >
          {nativeAd.callToAction}
        </Text>
      </NativeAsset>
    </NativeAdView>
  );
};

export default NativeNewsOpenAd;
