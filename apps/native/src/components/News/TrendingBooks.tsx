import { LegendList } from "@legendapp/list/react-native";
import type { PartnerContent } from "@news-spend-media/payload/types";
import { useCallback } from "react";
import { Dimensions, Linking, Pressable, type ScrollViewProps, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { getImageData } from "#/utils/getImageData";
import { Image } from "../heroui/image";
import { Text } from "../heroui/text";

const { width, height } = Dimensions.get("window");

const CustomScrollView = (props: ScrollViewProps) => <ScrollView {...props} />;

export default function TrendingBooks({ books = [] }: { books: PartnerContent[] }) {
  const booksRenderItem = useCallback(({ item }: { item: PartnerContent }) => {
    const { url, blurhash } = getImageData(item?.media);
    return (
      <Pressable
        onPress={() => Linking.openURL(item?.links?.website ?? "").catch(console.error)}
        style={{ width: width * 0.31 }}
      >
        <Image
          className="w-full flex-1 overflow-hidden rounded-xl"
          contentFit="cover"
          placeholder={{
            blurhash,
          }}
          recyclingKey={item.id}
          source={{ uri: url ?? "" }}
          style={{ height: height * 0.19 }}
        />
        <Text className="mt-2 font-semibold text-gray-500 italic" numberOfLines={2}>
          {item.condition}
        </Text>
      </Pressable>
    );
  }, []);

  return (
    <View className="gap-1.5">
      <Text className="px-4" variant="subtitle">
        Trending Books
      </Text>

      <LegendList
        contentContainerStyle={{
          paddingHorizontal: 15,
          gap: 15,
        }}
        data={books}
        estimatedItemSize={136}
        horizontal
        renderItem={booksRenderItem}
        renderScrollComponent={CustomScrollView}
        showsHorizontalScrollIndicator={false}
        // suggestEstimatedItemSize
      />
    </View>
  );
}
