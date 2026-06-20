import type { PartnerContent } from "@news-spend-media/payload/types";
import { Linking, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";

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
    <Pressable className="mr-2.5 gap-2" onPress={onPress} style={{ width: width * 0.42 }}>
      <View className="items-center justify-center">
        <Image
          contentFit="cover"
          placeholder={{
            blurhash,
          }}
          placeholderContentFit="cover"
          recyclingKey={item.id}
          source={url}
          style={{ borderRadius: 5, height: width * 0.35, width: "100%" }}
        />
      </View>
      <View className="gap-2">
        <Text className="text-foreground" ellipsizeMode="tail" numberOfLines={3}>
          {item.condition}
        </Text>
        <View className="flex-row items-center justify-between">
          <View
            className="h-auto flex-row self-end rounded-full bg-s-300 px-2 py-1"
            style={{ backgroundColor: "#003964" }}
          >
            <Text className="text-white text-xs">{item.points} points</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
};

export { RelatedItemTask };
