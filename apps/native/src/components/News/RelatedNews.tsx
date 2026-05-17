import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import type { News, PartnerContent } from "@news-spend-media/payload/types";
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

type RelatedNewsData = (News | PartnerContent | (PartnerContent & { _type: string }))[];

const CustomScrollView = (props: ScrollViewProps) => <ScrollView {...props} />;

function isNews(item: unknown): item is News {
  return typeof item === "object" && item !== null && "type" in item;
}

function isRewardTask(item: unknown): item is PartnerContent & { _type: string } {
  return (
    typeof item === "object" &&
    item !== null &&
    "_type" in item &&
    (item as PartnerContent & { _type: string })._type === "rewardTask"
  );
}

const RelatedImage = memo(({ item, width }: { item: News | PartnerContent; width: number }) => {
  const mediaSource = isNews(item) ? item.image : item.media;
  const { url, blurhash } = getImageData(mediaSource);
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

const RelatedItem = memo(
  ({
    item,
    width,
    onPress,
  }: {
    item: News | PartnerContent;
    width: number;
    onPress: () => void;
  }) => {
    const isNewsItem = isNews(item);
    let title = item.title;
    if (isNewsItem && item.type !== "article" && item.type !== "video") {
      title = (item as News & { task?: string }).task ?? item.title;
    }
    const points = isNewsItem ? (item.points ?? 0) : 0;

    return (
      <Stack gap="$2" mr={10} onPress={onPress} width={width * 0.42}>
        <Stack ai="center" jc="center">
          <RelatedImage item={item} width={width} />
        </Stack>
        <Stack gap="$2">
          <Text ellipsizeMode="head" numberOfLines={3}>
            {title}
          </Text>
          {isNewsItem && points > 0 && (
            <XStack alignItems="center" jc="space-between">
              <PointsButton points={points} />
            </XStack>
          )}
        </Stack>
      </Stack>
    );
  },
);

function RelatedNews({ news }: { news: RelatedNewsData | undefined }) {
  const { width } = useWindowDimensions();
  const navigation = useNavigation();

  const handlePress = useCallback(
    (item: News | PartnerContent) => {
      const navigateToItem = () => {
        if (isNews(item) && (item.type === "article" || item.type === "video")) {
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

  const renderNewsItem = useCallback(
    ({ item }: LegendListRenderItemProps<RelatedNewsData[number]>) =>
      isRewardTask(item) ? (
        <RelatedItemTask item={item} />
      ) : (
        <RelatedItem item={item} onPress={() => handlePress(item)} width={width} />
      ),
    [width, handlePress],
  );

  const keyExtractor = useCallback((item: RelatedNewsData[number]) => item.id, []);

  if (!news?.length) {
    return null;
  }

  return (
    <Stack gap="$3">
      <Text>People are also reading</Text>
      <LegendList
        data={news}
        horizontal
        keyExtractor={keyExtractor}
        renderItem={renderNewsItem}
        renderScrollComponent={CustomScrollView}
        showsHorizontalScrollIndicator={false}
      />
    </Stack>
  );
}

export default memo(RelatedNews);
