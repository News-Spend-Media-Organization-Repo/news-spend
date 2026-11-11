import { LegendList } from "@legendapp/list/react-native";
import { useNavigation } from "@react-navigation/native";
import { useCallback } from "react";
import {
  Dimensions,
  Pressable,
  type ScrollViewProps,
  View,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import type { RouterOutputs } from "#/lib/orpc";
import { getImageData } from "#/utils/getImageData";
import { Text } from "../heroui/text";
import { SizedImage } from "../SizedImage";

type NewsType = RouterOutputs["news"]["home"]["docs"];

const { width, height } = Dimensions.get("window");

const CustomScrollView = (props: ScrollViewProps) => <ScrollView {...props} />;

export default function SpecialCoverage({
  specialCoverage = [],
}: {
  specialCoverage: NewsType;
}) {
  const navigation = useNavigation("NewsHome");

  const coveragesRenderItem = useCallback(
    ({ item }: { item: NewsType[number] }) => {
      const { url, fallbackUrl, blurhash } = getImageData(
        item?.image,
        "mobile"
      );
      return (
        <Pressable
          onPress={() =>
            navigation.navigate("Home", {
              screen: "News",
              params: { id: item.id, slug: item.slug },
            })
          }
          style={{ width: width * 0.31 }}
        >
          <SizedImage
            className="w-full overflow-hidden rounded-xl"
            contentFit="cover"
            fallbackSource={fallbackUrl}
            placeholder={{ blurhash }}
            recyclingKey={item.id}
            source={url}
            style={{
              height: height * 0.19,
            }}
          />
          <Text className="font-medium" numberOfLines={2} variant="caption">
            {item?.title}
          </Text>
        </Pressable>
      );
    },
    [navigation]
  );

  if (specialCoverage.length === 0) {
    return null;
  }

  return (
    <View className="gap-1">
      <Text className="px-4 font-bold text-lg">Special Coverage</Text>

      <LegendList
        contentContainerStyle={{
          paddingHorizontal: 15,
          gap: 15,
        }}
        data={specialCoverage}
        estimatedItemSize={134}
        horizontal
        // ItemSeparatorComponent={() => <Square w={15} />}
        // nestedScrollEnabled
        recycleItems
        renderItem={coveragesRenderItem}
        renderScrollComponent={CustomScrollView}
        showsHorizontalScrollIndicator={false}
        // suggestEstimatedItemSize
      />
    </View>
  );
}
