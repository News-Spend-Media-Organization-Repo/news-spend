import type { News } from "@news-spend-media/payload/types";
import { useNavigation } from "@react-navigation/native";
import { Card, Stack, Text, useWindowDimensions, XStack } from "tamagui";

import { Image } from "#/components/ui";
import { appOpenAdSheetState } from "#/state/appOpenAdState";
import { getImageData } from "#/utils/getImageData";

const VideoNewsItem = ({ videoNews }: { videoNews: News }) => {
  const { height } = useWindowDimensions();
  const navigation = useNavigation();

  const onPress = () => {
    if (
      Math.random() < 0.65 &&
      (appOpenAdSheetState.customAdReady || appOpenAdSheetState.nativeAdReady)
    ) {
      appOpenAdSheetState.open(onAdClose);
    } else {
      navigation.navigate("SingleLive", {
        slug: videoNews.slug,
        id: videoNews.id,
      });
    }
  };

  const onAdClose = () => {
    navigation.navigate("SingleLive", {
      slug: videoNews.slug,
      id: videoNews.id,
    });
  };

  if (!videoNews) return null;
  const { url, blurhash } = getImageData(videoNews.image);

  return (
    <Stack bg="$background">
      <Card
        bg="transparent"
        h={height * 0.3}
        mr={25}
        onPress={onPress}
        overflow="hidden"
        w="100%"
      >
        <Card.Footer padded>
          <XStack
            backgroundColor="$p500"
            bottom={0}
            f={1}
            left={0}
            pos="absolute"
            right={0}
          >
            <Text color="$s50" fow="700" px={20} py={12}>
              {videoNews?.title}
            </Text>
          </XStack>
        </Card.Footer>
        <Card.Background>
          <Image
            height={height * 0.3}
            placeholder={{
              blurhash,
            }}
            placeholderContentFit="cover"
            pos="absolute"
            source={url}
            // transition={1000}
            width="100%"
          />
        </Card.Background>
      </Card>
    </Stack>
  );
};
export default VideoNewsItem;
