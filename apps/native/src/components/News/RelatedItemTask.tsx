import type { PartnerContent } from "@news-spend-media/payload/types";
import { Linking, Platform, useWindowDimensions } from "react-native";
import { Stack, Text, XStack } from "tamagui";

import { Image } from "#/components/ui";
import { getImageData } from "#/utils/getImageData";

const RelatedItemTask = ({ item }: { item: PartnerContent }) => {
  const { width } = useWindowDimensions();
  const { url, blurhash } = getImageData(item?.media);

  const onPress = async () => {
    const url =
      Platform.select({
        ios: item?.links?.iosAppStore,
        android: item?.links?.androidPlayStore,
      }) ?? item?.links?.website;

    if (url) {
      await Linking.openURL(url);
    }
  };

  if (!item) {
    return null;
  }

  return (
    <Stack gap="$2" mr={10} onPress={onPress} width={width * 0.42}>
      <Stack ai="center" jc="center">
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
      </Stack>
      <Stack gap="$2">
        <Text ellipsizeMode="head" numberOfLines={3}>
          {item.condition}
        </Text>
        <XStack alignItems="center" jc="space-between">
          <Stack
            als="flex-end"
            bg="$color.s300"
            br="$10"
            fd="row"
            h="auto"
            px="$2"
            py="$1"
          >
            <Text color="white" fos="$3">
              {item.points} points
            </Text>
          </Stack>
        </XStack>
      </Stack>
    </Stack>
  );
};

export { RelatedItemTask };
