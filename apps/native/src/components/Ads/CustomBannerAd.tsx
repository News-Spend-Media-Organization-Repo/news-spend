import type { PartnerContent } from "@news-spend-media/payload/types";
import { useQuery } from "@tanstack/react-query";
import { memo, useId, useMemo } from "react";
import { Dimensions, Pressable, StyleSheet, View } from "react-native";
import { BannerAd as GoogleBannerAd } from "react-native-google-mobile-ads";
import { usePartnerClick } from "#/hooks/usePartnerClick";
import { adUnits } from "#/lib/adUnits";
import { orpc } from "#/lib/orpc";
import { getBannerDimensions, getGoogleBannerSize } from "#/utils/ads";
import { getImageData } from "#/utils/getImageData";
import { Image } from "../heroui/image";
import { Text } from "../heroui/text";

type BannerSize = PartnerContent["adSize"];
type AllowedAdSizeKeys = NonNullable<BannerSize>;

const { width: screenWidth } = Dimensions.get("window");

const BANNER_STALE_TIME_MS = 5 * 60 * 1000;

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
    /**
     * A banner is picked once per mount and then left alone.
     *
     * This was `staleTime: 0`, and `focusManager` is wired to AppState (see
     * useAppStateFocusManager), so every background/foreground cycle marked
     * the query stale and refetched it — the creative visibly swapped each
     * time the reader came back to an article they were halfway through.
     * Rotation belongs to a new mount, not to the app regaining focus.
     */
    staleTime: BANNER_STALE_TIME_MS,
  });

  /**
   * Keyed per slot, the way usePartnerAd is.
   *
   * `getOne` picks at random server-side, but every banner of the same size in
   * an article sent the identical input and so shared one cache entry — an
   * article with two MEDIUM_RECTANGLE slots showed the same partner twice and
   * billed the impression against a single pick. The instance id splits them
   * into independent picks.
   */
  const { data, isPending } = useQuery({
    ...queryOptions,
    queryKey: [...queryOptions.queryKey, id],
    refetchOnWindowFocus: false,
  });

  const { handleClick } = usePartnerClick();

  const { containerWidth, containerHeight } = useMemo(() => {
    // ANCHORED_ADAPTIVE_BANNER has no fixed dims, so we fill width at a 6:1 ratio
    if (size === "ANCHORED_ADAPTIVE") {
      return {
        containerWidth: AVAILABLE_WIDTH,
        containerHeight: Math.round(AVAILABLE_WIDTH / 6),
      };
    }

    const { width: nominalW, height: nominalH } = getBannerDimensions(size);

    // Scale down proportionally only if wider than screen; never scale up
    const scale = nominalW > AVAILABLE_WIDTH ? AVAILABLE_WIDTH / nominalW : 1;
    return {
      containerWidth: Math.round(nominalW * scale),
      containerHeight: Math.round(nominalH * scale),
    };
  }, [size]);

  /**
   * See NewsItemAd: the hook records the CPA click and picks in-app browser
   * vs store, which opening the URL here bypassed.
   */
  const onPress = () => {
    if (data) {
      handleClick(data, "banner-news-post");
    }
  };

  if (isPending) {
    return (
      <View
        style={{
          alignSelf: "center",
          backgroundColor: "#e5e5e5",
          height: containerHeight,
          width: containerWidth,
        }}
      />
    );
  }

  if (!data) {
    return (
      <GoogleBannerAd
        size={getGoogleBannerSize(size)}
        unitId={adUnits.banner}
      />
    );
  }

  // ← prefer bannerMedia, fall back to media for backwards compat
  const { url, blurhash } = getImageData(data?.media);

  return (
    <Pressable
      onPress={onPress}
      style={{
        alignSelf: "center",
        borderColor: "#e5e5e5",
        borderWidth: StyleSheet.hairlineWidth,
        height: containerHeight,
        overflow: "hidden",
        position: "relative",
        width: containerWidth,
      }}
    >
      <View
        style={{
          backgroundColor: "rgba(0,0,0,0.55)",
          left: 0,
          paddingHorizontal: 4,
          position: "absolute",
          top: 0,
          zIndex: 2,
        }}
      >
        <Text style={{ color: "white", fontSize: 10, lineHeight: 16 }}>Ad</Text>
      </View>

      <Image
        contentFit="contain"
        placeholder={{ blurhash }}
        placeholderContentFit="cover"
        source={{ uri: url || "" }}
        style={{ width: "100%", height: "100%" }}
      />
    </Pressable>
  );
};

export default memo(BannerAd);
