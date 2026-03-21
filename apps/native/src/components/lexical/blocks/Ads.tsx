import type { AdsBlock as AdBlk } from "@news-spend-media/payload/types";
import { memo } from "react";
import { Stack } from "tamagui";

import BannerAds from "#/components/Ads/BannerAds";

const AdsBlock = memo(function AdsBlock({ value }: { value: AdBlk }) {
  return (
    <Stack ai="center" jc="center" my="$3">
      <BannerAds size={value.type} />
    </Stack>
  );
});

export default AdsBlock;
