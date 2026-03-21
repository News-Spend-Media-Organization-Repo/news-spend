import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { PartnerContent } from "@news-spend-media/payload/types";
import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { Paragraph, Spinner, Stack, XStack } from "tamagui";
import { CaretLeft } from "tamagui-phosphor";

import { Screen } from "#/components/Screen";
import { Button, Image, Text } from "#/components/ui";
import { usePartnerClick } from "#/hooks/usePartnerClick";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";
import { getImageData } from "#/utils/getImageData";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

function LuckyAppWall() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsetsStyle(["bottom", "top"]);
  const { handleClick, isLoading } = usePartnerClick();

  const queryOptions = orpc.partnerContent.filtered.infiniteOptions({
    input: (pageParam: number | undefined) => ({
      limit: 5,
      placement: ["lucky-app-wall"],
      type: ["app", "book", "survey"],
      pageParam,
    }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const {
    data,
    isPending,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery(queryOptions);

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.docs) || [],
    [data]
  );

  const keyExtractor = useCallback((item: PartnerContent) => item.id, []);

  const emptyList = useCallback(
    () => (
      <Stack ai="center" h="100%" jc="center">
        <Paragraph fos="$5">No apps found</Paragraph>
      </Stack>
    ),
    []
  );

  const onEndReached = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [isFetchingNextPage, hasNextPage]);

  const footer = useCallback(
    () => (
      <Stack ai="center" h="100%" jc="center">
        {isFetchingNextPage ? <Spinner /> : null}
      </Stack>
    ),
    [isFetchingNextPage]
  );

  const onRefresh = useCallback(() => {
    refetchByUser();
  }, []);

  const renderAppItem = ({
    item,
  }: LegendListRenderItemProps<PartnerContent>) => {
    const { blurhash, url } = getImageData(item.media);
    const loading = isLoading(item.id);

    return (
      <XStack
        ai="flex-start"
        gap="$2"
        onPress={() => handleClick(item)}
        opacity={loading ? 0.7 : 1}
        p="$3"
      >
        <Image
          br="$3"
          contentFit="cover"
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
            {loading ? <Spinner color="#666" size="small" /> : null}
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
      <LegendList
        data={items}
        estimatedItemSize={100}
        keyExtractor={keyExtractor}
        ListEmptyComponent={emptyList}
        ListFooterComponent={footer}
        onEndReached={onEndReached}
        onRefresh={onRefresh}
        refreshing={isRefetchingByUser}
        renderItem={renderAppItem}
      />
    </Screen>
  );
}

export default LuckyAppWall;
