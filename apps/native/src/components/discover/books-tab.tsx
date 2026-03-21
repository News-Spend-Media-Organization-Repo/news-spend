import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { PartnerContent } from "@news-spend-media/payload/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { memo, useCallback, useId, useMemo } from "react";
import { Pressable } from "react-native";
import {
  Paragraph,
  Spinner,
  Stack,
  Text as TamaguiText,
  XStack,
} from "tamagui";

import { Image } from "#/components/ui";
import { usePartnerClick } from "#/hooks/usePartnerClick";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";
import { getImageData } from "#/utils/getImageData";

const ITEM_HEIGHT = 280;

function BooksTabComponent() {
  const id = useId();
  const { handleClick, isLoading } = usePartnerClick();

  const queryOptions = orpc.partnerContent.filtered.infiniteOptions({
    input: (pageParam: number | undefined) => ({
      limit: 6,
      type: ["book"],
      placement: ["points-mall-books"],
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
  const flatData = useMemo(
    () => data?.pages.flatMap((page) => page.docs) ?? [],
    [data]
  );

  const renderItem = useCallback(
    (props: LegendListRenderItemProps<PartnerContent>) => {
      const { item } = props;
      const { blurhash, url } = getImageData(item.media);
      const loading = isLoading(item.id);

      return (
        <Pressable onPress={() => handleClick(item)}>
          <Stack br="$2" mb="$2" opacity={loading ? 0.7 : 1} ov="hidden">
            <Image
              contentFit="cover"
              minHeight={220}
              placeholder={{ blurhash }}
              source={{ uri: url ?? "" }}
              w="100%"
            />
            <XStack ai="center" gap="$2" mt="$2">
              <TamaguiText
                color="$gray.50"
                flex={1}
                fontStyle="italic"
                fow="600"
                numberOfLines={2}
              >
                {item.condition}
              </TamaguiText>
              {loading ? <Spinner color="#666" size="small" /> : null}
            </XStack>
          </Stack>
        </Pressable>
      );
    },
    [handleClick, isLoading]
  );

  const keyExtractor = useCallback((item: PartnerContent) => item.id, []);

  const emptyList = useCallback(
    () => (
      <Stack ai="center" h="100%" jc="center">
        <Paragraph fos="$5">No books found</Paragraph>
      </Stack>
    ),
    []
  );

  const onEndReached = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  const footer = useCallback(
    () =>
      hasNextPage ? (
        <Stack ai="center" py="$4">
          <Spinner />
        </Stack>
      ) : null,
    [hasNextPage]
  );

  const onRefresh = useCallback(() => {
    refetchByUser();
  }, [refetchByUser]);

  if (isPending) {
    return <Spinner />;
  }

  return (
    <LegendList
      contentContainerStyle={{
        paddingVertical: 10,
        gap: 25,
        paddingHorizontal: 12,
      }}
      data={flatData}
      estimatedItemSize={ITEM_HEIGHT}
      key={id}
      keyExtractor={keyExtractor}
      ListEmptyComponent={emptyList}
      ListFooterComponent={footer}
      numColumns={2}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      onRefresh={onRefresh}
      refreshing={isRefetchingByUser}
      renderItem={renderItem}
      style={{
        paddingHorizontal: 12,
      }}
    />
  );
}

export const BooksTab = memo(BooksTabComponent);
