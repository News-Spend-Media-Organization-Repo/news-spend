import { LegendList } from "@legendapp/list/react-native";
import type { PartnerContent } from "@news-spend-media/payload/types";
import { useCallback } from "react";
import { Dimensions, Linking, type ScrollViewProps } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Heading, Square, Stack, Text } from "tamagui";

import { Image } from "#/components/ui";
import { getImageData } from "#/utils/getImageData";

const { width, height } = Dimensions.get("window");

const CustomScrollView = (props: ScrollViewProps) => <ScrollView {...props} />;

export default function TrendingBooks({
  books = [],
}: {
  books: PartnerContent[];
}) {
  const booksRenderItem = useCallback(({ item }: { item: PartnerContent }) => {
    const { url, blurhash } = getImageData(item?.media);
    return (
      <Stack
        onPress={() =>
          Linking.openURL(item?.links?.website ?? "").catch(console.error)
        }
        w={width * 0.31}
      >
        <Image
          br="$1"
          contentFit="cover"
          flex={1}
          h={height * 0.19}
          ov="hidden"
          placeholder={{
            blurhash,
          }}
          recyclingKey={item.id}
          source={{ uri: url ?? "" }}
          w="100%"
        />
        <Text
          color="$gray.50"
          fontStyle="italic"
          fow="600"
          mt="$2"
          numberOfLines={2}
        >
          {item.condition}
        </Text>
      </Stack>
    );
  }, []);

  return (
    <Stack gap="$1.5">
      <Heading fos="$6" px="$3">
        Trending Books
      </Heading>

      <LegendList
        contentContainerStyle={{
          paddingHorizontal: 15,
        }}
        data={books}
        estimatedItemSize={136}
        horizontal
        ItemSeparatorComponent={() => <Square w={15} />}
        renderItem={booksRenderItem}
        renderScrollComponent={CustomScrollView}
        showsHorizontalScrollIndicator={false}
        // suggestEstimatedItemSize
      />
    </Stack>
  );
}
