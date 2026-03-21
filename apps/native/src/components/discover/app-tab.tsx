import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { PartnerContent } from "@news-spend-media/payload/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { Paragraph, Spinner, Stack, Text, XStack } from "tamagui";

import { Image } from "#/components/ui";
import { usePartnerClick } from "#/hooks/usePartnerClick";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";
import { getImageData } from "#/utils/getImageData";

export const AppTab = () => {
  const { handleClick, isLoading } = usePartnerClick();

  const queryOptions = orpc.partnerContent.filtered.infiniteOptions({
    input: (pageParam: number | undefined) => ({
      limit: 5,
      type: ["app"],
      placement: ["points-mall-apps"],
      page: pageParam,
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
  const appsData = useMemo(
    () => data?.pages.flatMap((page) => page.docs) || [],
    [data]
  );

  const renderItem = useCallback(
    (props: LegendListRenderItemProps<PartnerContent>) => {
      const { item } = props;
      const { blurhash, url } = getImageData(item.media);
      const loading = isLoading(item.id);

      return (
        <XStack
          ai="flex-start"
          gap="$2.5"
          onPress={() => handleClick(item)}
          opacity={loading ? 0.7 : 1}
          p="$3"
        >
          <Image
            br="$3"
            height={80}
            placeholder={{ blurhash }}
            source={{ uri: url ?? "" }}
            width={80}
          />
          <Stack flex={1} h="100%" jc="space-between">
            <Stack>
              <XStack ai="center" gap="$2">
                <Paragraph flex={1} fos="$5" numberOfLines={2}>
                  {item.title}
                </Paragraph>
                {loading ? <Spinner color="#667" size="small" /> : null}
              </XStack>
              <Text color="$gray.50" fos="$4" numberOfLines={2}>
                {item.condition}
              </Text>
            </Stack>
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
          </Stack>
        </XStack>
      );
    },
    [handleClick, isLoading]
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

  if (isPending) {
    return <Spinner />;
  }

  return (
    <LegendList
      data={appsData}
      estimatedItemSize={90}
      keyExtractor={keyExtractor}
      ListEmptyComponent={emptyList}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      onRefresh={onRefresh}
      refreshing={isRefetchingByUser}
      renderItem={renderItem}
    />
  );
};
