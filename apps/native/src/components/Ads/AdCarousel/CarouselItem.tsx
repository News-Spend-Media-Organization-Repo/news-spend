// biome-ignore lint/style/useFilenamingConvention: PascalCase matches existing convention

import type React from "react";
import { useMemo } from "react";
import { type ScrollViewProps } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Stack } from "tamagui";

import { Image } from "#/components/ui";
import { getImageData } from "#/utils/getImageData";

import type { AdCarouselRef, CarouselItemData } from "./types";
import VideoComponent from "./VideoComponent";

export const CustomScrollView = (props: ScrollViewProps) => <ScrollView {...props} />;

const CarouselItem = ({
  item,
  index,
  width,
  adCarouselRef,
}: {
  item: CarouselItemData;
  index: number;
  width: number;
  adCarouselRef: React.RefObject<AdCarouselRef | null>;
}) => {
  const blk = item.layout?.[0];
  const isFirstItem = index === 0;

  const { url, blurhash } = useMemo(
    () => getImageData(blk?.blockType === "promo-image" ? blk?.image : undefined),
    [blk],
  );

  const itemWidth = isFirstItem ? width * 0.85 : 120;

  return (
    <Stack br="$3" gap="$1" height={200} mr={15} overflow="hidden" w={itemWidth}>
      {blk?.blockType === "promo-video-source" ? (
        <VideoComponent adCarouselRef={adCarouselRef} item={blk} />
      ) : (
        <Image h="100%" placeholder={{ blurhash }} source={url} w="100%" />
      )}
    </Stack>
  );
};

export default CarouselItem;
