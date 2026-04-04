import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { PartnerContent } from "@news-spend-media/payload/types";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { Linking, Platform } from "react-native";
import { Paragraph, Spinner, Stack, XStack } from "tamagui";
import { CaretLeft } from "tamagui-phosphor";

import { Screen } from "#/components/Screen";
import { Button, Image, Text } from "#/components/ui";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";
import { getImageData } from "#/utils/getImageData";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

function LuckyAppWall() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsetsStyle(["bottom", "top"]);

  const queryOptions = orpc.partnerContent.random.queryOptions({
    input: {
      placement: ["lucky-app-wall"],
      type: ["app", "book", "survey"],
      limit: 10,
    },
  });

  const { data: items, isPending, refetch } = useQuery(queryOptions);

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  const keyExtractor = useCallback((item: PartnerContent) => item.id, []);

  const emptyList = useCallback(
    () => (
      <Stack ai="center" h="100%" jc="center">
        <Paragraph fos="$5">No offers available</Paragraph>
      </Stack>
    ),
    []
  );

  const onRefresh = useCallback(() => {
    refetchByUser();
  }, []);

  const handleClick = useCallback((item: PartnerContent) => {
    let url = Platform.select({
      ios: item.links?.iosAppStore,
      android: item.links?.androidPlayStore,
    });
    if (!url) {
      url = item.links?.website;
    }

    if (!url) {
      return;
    }

    Linking.openURL(url);
  }, []);

  const renderAppItem = ({
    item,
  }: LegendListRenderItemProps<PartnerContent>) => {
    const { blurhash, url } = getImageData(item.media);

    return (
      <XStack ai="flex-start" gap="$2" onPress={() => handleClick(item)} p="$3">
        <Image
          br="$3"
          contentFit="contain"
          height={80}
          placeholder={{ blurhash }}
          source={{ uri: url ?? "" }}
          width={80}
        />
        <Stack flex={1} gap="$2">
          <XStack ai="center" gap="$2">
            <Text flex={1} fos="$5" numberOfLines={2}>
              {item.title}
            </Text>
          </XStack>
          <Text
            color="$gray.50"
            fos="$3"
            fost="italic"
            fow="600"
            numberOfLines={2}
          >
            {item.description}
          </Text>
        </Stack>
      </XStack>
    );
  };

  if (isPending) {
    return <Spinner />;
  }

  return (
    <Screen contentContainerStyle={{ paddingBottom: insets.paddingBottom }}>
      <XStack ai="center" bg="$p500" gap="$2.5" pt={insets.paddingTop} px="$2">
        <Button
          gap="$2"
          ghost
          h="auto"
          onPress={() => navigation.goBack()}
          p="$0"
          py="$2"
        >
          <Button.Icon color="#fff">
            <CaretLeft />
          </Button.Icon>
          <Button.Text color="#fff" fos="$4">
            Lucky App Wall
          </Button.Text>
        </Button>
      </XStack>
      <Stack flex={1}>
        <LegendList
          data={items ?? []}
          estimatedItemSize={100}
          keyExtractor={keyExtractor}
          ListEmptyComponent={emptyList}
          onRefresh={onRefresh}
          refreshing={isRefetchingByUser}
          renderItem={renderAppItem}
        />
      </Stack>
    </Screen>
  );
}

export default LuckyAppWall;
