import type { PartnerContent } from "@news-spend-media/payload/types";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { Image } from "#/components/ui";
import { usePartnerClick } from "#/hooks/usePartnerClick";
import { getImageData } from "#/utils/getImageData";

const RelatedItemTask = ({ item }: { item: PartnerContent }) => {
  const { width } = useWindowDimensions();
  const { url, blurhash } = getImageData(item?.media);

  const { handleClick } = usePartnerClick();

  // The placement the feed's partner pool is fetched with, so the click is
  // recorded like every other ad.
  const onPress = () => handleClick(item, "homepage-ads-banner");

  if (!item) {
    return null;
  }

  return (
    <Pressable
      className="mr-2.5 gap-2"
      onPress={onPress}
      style={{ width: width * 0.42 }}
    >
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
        <Text
          className="text-foreground"
          ellipsizeMode="tail"
          numberOfLines={3}
        >
          {item.condition}
        </Text>
      </View>
    </Pressable>
  );
};

export { RelatedItemTask };
