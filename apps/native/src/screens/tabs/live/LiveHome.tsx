import { LegendList } from "@legendapp/list/react-native";
import type { FeedItem } from "@news-spend-media/api/router/news/content-builders";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { memo, useCallback, useMemo } from "react";
import { ActivityIndicator, RefreshControl } from "react-native";
import { Screen } from "#/components/heroui/screen";
import LiveListHeader from "#/components/News/LiveListHeader";
import LiveListSkeleton from "#/components/News/LiveListSkeleton";
import VideoNewsItem from "#/components/videoNews/VideoNewsItem";
import { useAllNews } from "#/hooks/news";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";

function LiveHome() {
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

  const renderItem = useCallback(({ item }: { item: FeedItem }) => {
    if (item.type !== "article" && item.type !== "video") {
      return null;
    }
    return <VideoNewsItem videoNews={item} />;
  }, []);

  const allPages = useMemo(
    () => data?.pages.flatMap((page) => page?.docs) ?? [],
    [data]
  );

  const _renderHeader = useCallback(
    () => <LiveListHeader news={allPages[0]} />,
    [allPages]
  );

  const keyExtractor = (item: FeedItem) => item.id;

  const videoNews = useMemo(() => {
    if (!allPages.length) {
      return [];
    }
    // remove the first item because it's already rendered in the header
    return allPages;
    // return allPages.slice(1);
  }, [allPages]);

  const onEndReached = useCallback(() => {
    if (isFetchingNextPage || !hasNextPage) {
      return;
    }
    fetchNextPage();
  }, [isFetchingNextPage, fetchNextPage, hasNextPage]);

  if (isPending) {
    return <LiveListSkeleton />;
  }

  return (
    <Screen contentContainerClassName="px-2" systemBarStyle="light">
      <LegendList
        contentContainerStyle={{
          paddingBottom: tabBarHeight + 20,
          paddingTop: 15,
          gap: 28,
        }}
        data={videoNews}
        estimatedItemSize={283}
        keyExtractor={keyExtractor}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator /> : null}
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
      />
    </Screen>
  );
}

export default memo(LiveHome);
