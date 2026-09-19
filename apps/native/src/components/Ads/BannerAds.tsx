import { memo, useState } from "react";
import {
  BannerAdSize,
  BannerAd as GoogleBannerAd,
} from "react-native-google-mobile-ads";

import { adUnits } from "#/lib/adUnits";
import { getGoogleBannerSize, sizeMap } from "#/utils/ads";
import { SCREENSHOT_MODE } from "#/utils/screenshotMode";

import CustomBannerAd from "./CustomBannerAd";

type BannerSize =
  | "MEDIUM_RECTANGLE"
  | "BANNER"
  | "LARGE_BANNER"
  | "FULL_BANNER"
  | "LEADERBOARD";

type BannerAdsProps = {
  size: BannerSize;
};

function BannerAds({ size }: BannerAdsProps) {
  /**
   * The Google-vs-partner split is decided once, when the slot mounts.
   *
   * Held in state rather than re-rolled in the render body: a bare
   * `Math.random()` here is only stable because `memo` happens to block
   * re-renders today, and the moment anything gives this component a new prop
   * the slot would silently swap between a Google banner and a partner one
   * mid-read — unmounting the partner query and buying a fresh creative with
   * it. The lazy initializer keeps the roll to one per mount.
   */
  const [useGoogleAd] = useState(() => Math.random() < 0.4);

  if (SCREENSHOT_MODE) {
    return null;
  }

  if (size in sizeMap) {
    return useGoogleAd ? (
      <GoogleBannerAd
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        size={getGoogleBannerSize(size)}
        unitId={adUnits.banner}
      />
    ) : (
      <CustomBannerAd size={size} />
    );
  }

  return (
    <GoogleBannerAd
      size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
      unitId={adUnits.banner}
    />
  );
}

export default memo(BannerAds);
