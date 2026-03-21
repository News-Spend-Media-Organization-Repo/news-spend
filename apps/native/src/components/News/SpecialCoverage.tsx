import { LegendList } from "@legendapp/list/react-native";
import { useNavigation } from "@react-navigation/native";
import { useCallback } from "react";
import { Dimensions, type ScrollViewProps } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Heading, Square, Stack, Text } from "tamagui";

import { Image } from "#/components/ui";
import type { RouterOutputs } from "#/lib/orpc";
import { getImageData } from "#/utils/getImageData";

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
      const { url, blurhash } = getImageData(item?.image);
      return (
        <Stack
          onPress={() =>
            navigation.navigate("Home", {
              screen: "SingleLive",
              params: { id: item.id, slug: item.slug },
            })
          }
        >
          <Stack w={width * 0.31}>
            <Image
              br="$1"
              contentFit="cover"
              h={height * 0.19}
              ov="hidden"
              placeholder={{ blurhash }}
              recyclingKey={item.id}
              source={url}
              w="100%"
            />
            <Text fow="600" mt="$2" numberOfLines={2}>
              {item?.title}
            </Text>
          </Stack>
        </Stack>
      );
    },
    [navigation]
  );

  return (
    <Stack gap="$1" minHeight={height * 0.2}>
      <Heading fos="$6" px="$3">
        Special Coverage
      </Heading>

      <LegendList
        contentContainerStyle={{
          paddingHorizontal: 15,
        }}
        data={specialCoverage}
        horizontal
        ItemSeparatorComponent={() => <Square w={15} />}
        nestedScrollEnabled
        renderItem={coveragesRenderItem}
        renderScrollComponent={CustomScrollView}
        showsHorizontalScrollIndicator={false}
        suggestEstimatedItemSize
      />
    </Stack>
  );
}
