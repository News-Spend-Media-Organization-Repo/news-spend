import { LegendList } from "@legendapp/list/react-native";
import type { News } from "@news-spend-media/payload/types";
import { useNavigation } from "@react-navigation/native";
import { memo, useCallback } from "react";
import { type ScrollViewProps, useWindowDimensions } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Stack, Text, XStack } from "tamagui";
import { Button, Image } from "#/components/ui";
import { isAdReady, shouldShowNewsClickAd } from "#/state/adManager";
import { appOpenAdSheetState } from "#/state/appOpenAdState";
import { getImageData } from "#/utils/getImageData";
import { RelatedItemTask } from "./RelatedItemTask";

const CustomScrollView = (props: ScrollViewProps) => <ScrollView {...props} />;

const NewsImage = memo(({ item, width }: { item: News; width: number }) => {
  const { url, blurhash } = getImageData(item.image);
  return (
    <Image
      borderRadius={5}
      contentFit="cover"
      h={width * 0.35}
      placeholder={{
        blurhash,
      }}
      placeholderContentFit="cover"
      recyclingKey={item.id}
      source={url}
      w="100%"
    />
  );
});

const PointsButton = memo(({ points }: { points: number }) => (
  <Button als="flex-end" bg="$color.s300" br="$10" fd="row" h="auto" px="$2" py="$1">
    <Button.Text fos="$3">{points} points</Button.Text>
  </Button>
));

const NewsItem = memo(
  ({ item, width, onPress }: { item: News; width: number; onPress: () => void }) => (
    <Stack gap="$2" mr={10} onPress={onPress} width={width * 0.42}>
      <Stack ai="center" jc="center">
        <NewsImage item={item} width={width} />
      </Stack>
      <Stack gap="$2">
        <Text ellipsizeMode="head" numberOfLines={3}>
          {item.type === "article" || item.type === "video"
            ? item.title
            : (item.task ?? item?.title)}
        </Text>
        <XStack alignItems="center" jc="space-between">
          <PointsButton points={item.points} />
        </XStack>
      </Stack>
    </Stack>
  ),
);

function RelatedNews({ news }: { news: News[] }) {
  const { width } = useWindowDimensions();
  const navigation = useNavigation();

  const handlePress = useCallback(
    (item: News) => {
      const navigateToItem = () => {
        if (item.type === "article" || item.type === "video") {
          navigation.navigate(item.type === "article" ? "News" : "SingleLive", {
            id: item.id,
            slug: item.slug,
          });
        }
      };

      if (
        shouldShowNewsClickAd() &&
        (isAdReady("news-click-ads") || appOpenAdSheetState.nativeAdReady)
      ) {
        appOpenAdSheetState.open("news-click-ads", navigateToItem);
      } else {
        navigateToItem();
      }
    },
    [navigation],
  );

  // FlashList's renderItem prop receives an object { item, index, separators }
  const renderNewsItem = useCallback(
    (item: News) =>
      item?._type === "rewardTask" ? (
        <RelatedItemTask item={item} />
      ) : (
        <NewsItem item={item} onPress={() => handlePress(item)} width={width} />
      ),
    [width, handlePress],
  );

  // keyExtractor for FlashList
  const keyExtractor = useCallback((item: News) => {
    // console.log(item.id);
    return item.id;
  }, []);

  if (!news?.length) {
    return null;
  }

  const estimatedItemWidth = width * 0.42 + 10; // Width of NewsItem + marginRight (10)

  return (
    <Stack gap="$3">
      <Text>People are also reading</Text>
      <LegendList
        data={news}
        horizontal
        keyExtractor={keyExtractor}
        renderItem={renderNewsItem}
        renderScrollComponent={CustomScrollView}
        // contentContainerStyle={{ paddingHorizontal: 15 }}
        showsHorizontalScrollIndicator={false}
      />
    </Stack>
  );
}

export default memo(RelatedNews);
