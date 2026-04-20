import { memo } from "react";
import { BannerAdSize, BannerAd as GoogleBannerAd, TestIds } from "react-native-google-mobile-ads";

import { getGoogleBannerSize, sizeMap } from "#/utils/ads";

import CustomBannerAd from "./CustomBannerAd";

type BannerSize = "MEDIUM_RECTANGLE" | "BANNER" | "LARGE_BANNER" | "FULL_BANNER" | "LEADERBOARD";

type BannerAdsProps = {
  size: BannerSize;
};

function BannerAds({ size }: BannerAdsProps) {
  const useGoogleAd = Math.random() < 0.4;

  if (size in sizeMap) {
    return useGoogleAd ? (
      <GoogleBannerAd
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        size={getGoogleBannerSize(size)}
        unitId={TestIds.BANNER}
      />
    ) : (
      <CustomBannerAd size={size} />
    );
  }

  return (
    <GoogleBannerAd size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER} unitId={TestIds.BANNER} />
  );
}

export default memo(BannerAds);
