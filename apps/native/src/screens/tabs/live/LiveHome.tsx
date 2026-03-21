import { LegendList } from "@legendapp/list/react-native";
import type { News } from "@news-spend-media/payload/types";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { memo, useCallback, useMemo } from "react";
import { RefreshControl } from "react-native";
import { Spinner, Stack, useTheme } from "tamagui";

import LiveListHeader from "#/components/News/LiveListHeader";
import LiveListSkeleton from "#/components/News/LiveListSkeleton";
import { Screen } from "#/components/Screen";
import VideoNewsItem from "#/components/videoNews/VideoNewsItem";
import { useAllNews } from "#/hooks/news";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";

function LiveHome() {
  const theme = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const {
    data,
    isPending,
    refetch,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAllNews({
    type: "video",
  });
  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  const renderItem = useCallback(
    ({ item }: { item: News }) => <VideoNewsItem videoNews={item} />,
    []
  );

  const allPages = useMemo(
    () => data?.pages.flatMap((page) => page?.docs) ?? [],
    [data]
  );

  const renderHeader = useCallback(
    () => <LiveListHeader news={allPages[0]} />,
    [allPages]
  );

  const keyExtractor = (item: News) => item.id;

  const videoNews = useMemo(() => {
    if (!allPages.length) return [];
    // remove the first item because it's already rendered in the header
    return allPages;
    // return allPages.slice(1);
  }, [allPages]);

  const onEndReached = useCallback(() => {
    if (isFetchingNextPage || !hasNextPage) return;
    fetchNextPage();
  }, [isFetchingNextPage, fetchNextPage, hasNextPage]);

  if (isPending) return <LiveListSkeleton />;

  return (
    <Screen px="$1.5">
      <LegendList
        contentContainerStyle={{
          paddingBottom: tabBarHeight / 2,
          paddingTop: 15,
        }}
        data={videoNews}
        estimatedItemSize={280}
        ItemSeparatorComponent={() => <Stack h="$1.5" />}
        keyExtractor={keyExtractor}
        ListFooterComponent={isFetchingNextPage ? <Spinner /> : null}
        // ListHeaderComponent={renderHeader}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            onRefresh={refetchByUser}
            refreshing={isRefetchingByUser}
          />
        }
        renderItem={renderItem}
        scrollEnabled={!isPending}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

export default memo(LiveHome);
