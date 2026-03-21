import { useNavigation } from "@react-navigation/native";
import { Clock, Play } from "@tamagui/lucide-icons";
import { formatDistanceToNow } from "date-fns";
import { Circle, Stack, Text, XStack, YStack } from "tamagui";

import { Button, Image } from "#/components/ui";
import type { RouterOutputs } from "#/lib/orpc";
import { appOpenAdSheetState } from "#/state/appOpenAdState";
import { getImageData } from "#/utils/getImageData";

export default function NewsItem({
  news,
  latest,
}: {
  news: RouterOutputs["news"]["home"]["docs"][number];
  latest?: boolean;
}) {
  const { url, blurhash } = getImageData(news.image);
  const navigation = useNavigation();

  const onPress = () => {
    if (
      Math.random() < 0.65 &&
      (appOpenAdSheetState.customAdReady || appOpenAdSheetState.nativeAdReady)
    ) {
      appOpenAdSheetState.open(onAdClose);
    } else if (news.type === "article") {
      navigation.navigate("News", {
        slug: news.slug,
        id: news.id,
        latest, // TODO: fix type
      });
    } else {
      navigation.navigate("SingleLive", {
        slug: news.slug,
        id: news.id,
      });
    }
  };

  const onAdClose = () => {
    if (news.type === "article") {
      navigation.navigate("News", {
        slug: news.slug,
        id: news.id,
        latest,
      });
    } else {
      navigation.navigate("SingleLive", {
        slug: news.slug,
        id: news.id,
      });
    }
  };

  return (
    <Stack
      // p="$3"
      onPress={onPress}
    >
      <XStack gap="$4">
        <Stack ai="center" jc="center">
          <Image
            borderRadius={10}
            contentFit="cover"
            h={100}
            placeholder={{ blurhash }}
            placeholderContentFit="cover"
            recyclingKey={news?.id}
            source={url}
            w={100}
          />
          {news.type === "video" && (
            <Circle
              ai="center"
              bg="black"
              boc="#fff"
              bw={1}
              jc="center"
              opacity={0.7}
              pos="absolute"
              size="$3"
            >
              <Play fill="#fff" size={32} />
            </Circle>
          )}
        </Stack>
        <YStack
          flex={1}
          gap={latest ? 0 : "$4"}
          jc={latest ? "space-between" : "center"}
        >
          {latest && (
            <Text color="$p500" fontWeight="700">
              {typeof news.category === "object" && news.category?.title}
            </Text>
          )}
          <Text ellipsizeMode="head" numberOfLines={2}>
            {news.title}
          </Text>
          <XStack alignItems="center" jc="space-between">
            <XStack alignItems="center" gap="$1">
              <Clock color="#737373" size={15} />
              <Text color="#737373">
                {formatDistanceToNow(new Date(news.createdAt), {
                  addSuffix: true,
                })}
              </Text>
            </XStack>
            <Button
              als="flex-end"
              bg="$color.s300"
              br="$10"
              fd="row"
              h="auto"
              px="$2"
              py="$1"
            >
              <Button.Text fos="$3">{news.points} points</Button.Text>
            </Button>
          </XStack>
        </YStack>
      </XStack>
    </Stack>
  );
}
