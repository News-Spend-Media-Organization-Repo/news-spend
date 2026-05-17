import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import type { News } from "@news-spend-media/payload/types";
import { useNavigation } from "@react-navigation/native";
import { useCallback } from "react";
import { Dimensions, type ScrollViewProps } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Card, Text, XStack } from "tamagui";

import { Image } from "#/components/ui";
import { isAdReady, shouldShowNewsClickAd } from "#/state/adManager";
import { appOpenAdSheetState } from "#/state/appOpenAdState";
import { getImageData } from "#/utils/getImageData";

const SPACING = 5;
const { width, height } = Dimensions.get("window");
const ITEM_WIDTH = width * 0.88;
const ITEM_HEIGHT = height * 0.3;
const FULL_SIZE = ITEM_WIDTH + SPACING * 2;

const CustomScrollView = (props: ScrollViewProps) => <ScrollView {...props} />;

export default function TrendingNews({ news }: { news: News[] }) {
  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<News>) => <TrendingNewsItem item={item} />,
    [],
  );

  return (
    <LegendList
      data={news}
      decelerationRate="fast"
      estimatedItemSize={355.625}
      horizontal
      keyExtractor={(item, index) => `${item.id}-${index}`}
      pagingEnabled
      renderItem={renderItem}
      renderScrollComponent={CustomScrollView}
      showsHorizontalScrollIndicator={false}
      snapToAlignment="center"
      snapToInterval={FULL_SIZE}
      style={{ height: ITEM_HEIGHT, marginTop: 10 }}
      // suggestEstimatedItemSize
    />
  );
}

const TrendingNewsItem = ({ item }: { item: News }) => {
  const navigation = useNavigation("NewsHome");
  const { url, blurhash } = getImageData(item?.image);

  const onAdClose = useCallback(() => {
    if (item?.type === "video") {
      navigation.navigate("SingleLive", {
        slug: item.slug,
        id: item.id,
      });
    } else {
      navigation.navigate("News", {
        slug: item.slug,
        id: item.id,
      });
    }
  }, [item, navigation]);

  const onPress = useCallback(() => {
    if (
      shouldShowNewsClickAd() &&
      (isAdReady("news-click-ads") || appOpenAdSheetState.nativeAdReady)
    ) {
      appOpenAdSheetState.open("news-click-ads", onAdClose);
    } else if (item?.type === "video") {
      navigation.navigate("SingleLive", {
        slug: item.slug,
        id: item.id,
      });
    } else {
      navigation.navigate("News", {
        slug: item.slug,
        id: item.id,
      });
    }
  }, [item, navigation, onAdClose]);

  return (
    <Card bordered h={ITEM_HEIGHT} mx={SPACING} onPress={onPress} overflow="hidden" w={ITEM_WIDTH}>
      <Card.Footer padded>
        <XStack backgroundColor="$p500" bottom={0} f={1} left={0} pos="absolute" right={0}>
          <Text color="$s50" fow="700" px={20} py={12}>
            {item.title}
          </Text>
        </XStack>
      </Card.Footer>
      <Card.Background>
        <Image
          contentFit="cover"
          h={ITEM_HEIGHT}
          placeholder={{
            blurhash,
          }}
          placeholderContentFit="cover"
          pos="absolute"
          recyclingKey={item.id}
          source={url}
          w="100%"
        />
      </Card.Background>
    </Card>
  );
};
