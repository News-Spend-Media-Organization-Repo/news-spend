import type { PartnerContent } from "@news-spend-media/payload/types";
import type { RefObject } from "react";
import type { LayoutChangeEvent } from "react-native";
import { View } from "react-native";
import type { RouterOutputs } from "#/lib/orpc";
import { Text } from "../heroui/text";
import SpecialCoverage from "./SpecialCoverage";
import TrendingBooks from "./TrendingBooks";
import TrendingNews from "./TrendingNews";
import { FEED_PADDING_TOP, type TrendingVisibility } from "./trendingCarousel";

type NewsType = RouterOutputs["news"]["home"]["docs"];

export default function HomeListHeader({
  news,
  specialCoverage = [],
  books = [],
  trendingVisibility,
}: {
  news: NewsType;
  specialCoverage: NewsType;
  books: PartnerContent[];
  trendingVisibility?: RefObject<TrendingVisibility>;
}) {
  const onTrendingLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    if (trendingVisibility?.current) {
      trendingVisibility.current.top = y + FEED_PADDING_TOP;
      trendingVisibility.current.bottom = y + height + FEED_PADDING_TOP;
    }
  };

  return (
    <View className="mb-3 gap-4">
      <View className="gap-4" onLayout={onTrendingLayout}>
        <Text className="px-4 font-semibold text-base">Trending News</Text>
        <TrendingNews news={news} visibilityRef={trendingVisibility} />
      </View>

      <TrendingBooks books={books} />

      <SpecialCoverage specialCoverage={specialCoverage} />
      <Text className="px-4 font-semibold text-base">Latest News</Text>
    </View>
  );
}
