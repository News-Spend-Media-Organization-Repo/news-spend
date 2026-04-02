import type { PartnerContent } from "@news-spend-media/payload/types";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { memo, useId, useMemo } from "react";
import { Dimensions, Platform, StyleSheet } from "react-native";
import {
  BannerAd as GoogleBannerAd,
  TestIds,
} from "react-native-google-mobile-ads";
import { Stack, Text } from "tamagui";

import { Image } from "#/components/ui";
import { orpc } from "#/lib/orpc";
import { getBannerDimensions, getGoogleBannerSize } from "#/utils/ads";
import { getImageData } from "#/utils/getImageData";

type BannerSize = PartnerContent["adSize"];
type AllowedAdSizeKeys = NonNullable<BannerSize>;

const { width: screenWidth } = Dimensions.get("window");

// ← If your layout has horizontal padding (e.g. 16px each side), set this to 32
const HORIZONTAL_INSET = 0;
const AVAILABLE_WIDTH = screenWidth - HORIZONTAL_INSET * 2;

const BannerAd = ({ size }: { size: AllowedAdSizeKeys }) => {
  const id = useId();

  const queryOptions = orpc.partnerContent.getOne.queryOptions({
    input: {
      placement: ["banner-news-post"],
      adSize: size,
      type: ["banner"],
    },
  });

  const { data, isPending } = useQuery({
    ...queryOptions,
    queryKey: [...queryOptions.queryKey, id],
  });

  const { containerWidth, containerHeight } = useMemo(() => {
    // ANCHORED_ADAPTIVE_BANNER has no fixed dims — fill width at 6:1 ratio
    if (size === "ANCHORED_ADAPTIVE") {
      return {
        containerWidth: AVAILABLE_WIDTH,
        containerHeight: Math.round(AVAILABLE_WIDTH / 6),
      };
    }

    const { width: nominalW, height: nominalH } = getBannerDimensions(size);

    // Scale down proportionally only if wider than screen — never scale up
    const scale = nominalW > AVAILABLE_WIDTH ? AVAILABLE_WIDTH / nominalW : 1;
    return {
      containerWidth: Math.round(nominalW * scale),
      containerHeight: Math.round(nominalH * scale),
    };
  }, [size]);

  const onPress = async () => {
    let urlToOpen = Platform.select({
      ios: data?.links?.iosAppStore,
      android: data?.links?.androidPlayStore,
    });
    if (!urlToOpen && data?.links?.website) {
      urlToOpen = data.links.website;
    }
    if (urlToOpen) {
      const canOpen = await Linking.canOpenURL(urlToOpen);
      if (canOpen) {
        await Linking.openURL(urlToOpen);
      }
    }
  };

  if (isPending) {
    return (
      <Stack
        alignSelf="center"
        backgroundColor="$color4"
        height={containerHeight}
        width={containerWidth}
      />
    );
  }

  if (!data) {
    return (
      <GoogleBannerAd
        size={getGoogleBannerSize(size)}
        unitId={TestIds.BANNER}
      />
    );
  }

  // ← prefer bannerMedia, fall back to media for backwards compat
  const { url, blurhash } = getImageData(data?.media);

  return (
    <Stack
      alignSelf="center"
      borderColor="$borderColor"
      borderWidth={StyleSheet.hairlineWidth}
      height={containerHeight}
      onPress={onPress} // ← fixed px width, was "100%" (caused stretching)
      overflow="hidden"
      position="relative"
      width={containerWidth}
    >
      <Stack
        backgroundColor="rgba(0,0,0,0.55)"
        left={0}
        paddingHorizontal="$1"
        position="absolute"
        top={0}
        zIndex={2}
      >
        <Text color="white" fontSize={10} lineHeight={16}>
          Ad
        </Text>
      </Stack>

      <Image
        contentFit="contain"
        placeholder={{ blurhash }}
        placeholderContentFit="cover" // ← was missing; "contain" = no clipping ever
        source={{ uri: url || "" }}
        style={styles.image}
      />
    </Stack>
  );
};

const styles = StyleSheet.create({
  image: { width: "100%", height: "100%" },
});

export default memo(BannerAd);
