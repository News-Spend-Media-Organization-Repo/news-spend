import type { RewardTaskItem } from "@news-spend-media/api/router/news/content-builders";
import { Linking, Platform } from "react-native";
import { Stack, Text, XStack, YStack } from "tamagui";

import { Button, Image } from "#/components/ui";
import { getImageData } from "#/utils/getImageData";

function RewardTaskItem({ item }: { item: RewardTaskItem }) {
  const ad = item.payload;
  const { url, blurhash } = getImageData(ad?.media);

  if (!ad) {
    return null;
  }

  const onPress = async () => {
    const url =
      Platform.select({
        ios: ad?.links?.iosAppStore,
        android: ad?.links?.androidPlayStore,
      }) ?? ad?.links?.website;

    if (url) {
      await Linking.openURL(url);
    }
  };

  return (
    <Stack gap="$2.5" onPress={onPress}>
      <XStack gap="$4">
        <Image
          borderRadius={10}
          contentFit="cover"
          h={100}
          placeholder={blurhash}
          recyclingKey={item?.id}
          source={url}
          w={100}
        />
        <YStack flex={1} gap="$4" jc="center">
          <XStack jc="space-between">
            <Text color="$p500" fontWeight="700">
              {ad?.title}
            </Text>
          </XStack>
          <Text ellipsizeMode="tail" numberOfLines={2}>
            {ad?.condition}
          </Text>
          <XStack alignItems="center" jc="flex-end">
            <Button
              als="flex-end"
              bg="$color.s300"
              br="$10"
              fd="row"
              h="auto"
              px="$2"
              py="$1"
            >
              <Button.Text fos="$3">{ad?.points} points</Button.Text>
            </Button>
          </XStack>
        </YStack>
      </XStack>
    </Stack>
  );
}

export default RewardTaskItem;
