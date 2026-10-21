import type { LegendListRenderItemProps } from "@legendapp/list/react-native";
import type { PartnerContent } from "@news-spend-media/payload/types";
import { useFocusEffect } from "@react-navigation/native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { TabLegendList } from "react-native-collapsible-tab/legend-list";
import { useSnapshot } from "valtio";
import { Text } from "#/components/heroui/text";
import { usePartnerClick } from "#/hooks/usePartnerClick";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { trackDiscover } from "#/lib/discoverAnalyticsClient";
import { orpc } from "#/lib/orpc";
import { authState } from "#/state/auth";
import { useTabBarHeight } from "#/state/route-state";
import { AppItem } from "./app-item";
import {
  PullToRefreshIndicator,
  triggerRefreshHaptic,
} from "./pull-to-refresh-indicator";

export const AppTab = () => {
  const { handleClick, isLoading } = usePartnerClick();
  const tabBarHeight = useTabBarHeight();

  // Per user: the list hides what this person has completed. See all-tab.
  const userId = useSnapshot(authState).user?.id ?? null;
  const input = (pageParam: number | undefined) => ({
    limit: 5,
    type: ["app" as const],
    placement: ["points-mall-apps" as const],
    page: pageParam,
  });
  const queryOptions = orpc.partnerContent.filtered.infiniteOptions({
    input,
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.nextPage,
    queryKey: [
      ...orpc.partnerContent.filtered.infiniteKey({
        input,
        initialPageParam: undefined,
      }),
      { userId },
    ],
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

  // Fresh list on return — same as the home feed. Skipped on first focus
  // since mounting already fetched.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      refetch();
    }, [refetch])
  );
  const appsData = useMemo(
    () => data?.pages.flatMap((page) => page.docs) || [],
    [data]
  );

  const renderItem = useCallback(
    (props: LegendListRenderItemProps<PartnerContent>) => {
      const { item } = props;

      return (
        <AppItem
          item={item}
          loading={isLoading(item.id)}
          onPress={() => {
            trackDiscover({
              event: "open",
              itemType: "app",
              itemId: item.id,
              section: "apps",
            });
            handleClick(item, "points-mall-apps");
          }}
        />
      );
    },
    [handleClick, isLoading]
  );

  const keyExtractor = useCallback((item: PartnerContent) => item.id, []);

  const emptyList = useCallback(
    () => (
      <View className="flex-1 items-center justify-center">
        <Text className="text-base">No apps found</Text>
      </View>
    ),
    []
  );

  const onEndReached = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  const footer = useCallback(
    () => (
      <View className="flex-1 items-center justify-center">
        {isFetchingNextPage ? <ActivityIndicator /> : null}
      </View>
    ),
    [isFetchingNextPage]
  );

  const onRefresh = useCallback(() => {
    refetchByUser();
  }, [refetchByUser]);

  if (isPending) {
    return <ActivityIndicator />;
  }

  return (
    <View className="flex-1">
      <TabLegendList
        contentContainerStyle={{ paddingBottom: tabBarHeight }}
        data={appsData}
        estimatedItemSize={90}
        keyExtractor={keyExtractor}
        ListEmptyComponent={emptyList}
        ListFooterComponent={footer}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onScrollEndDrag={(e) => {
          if (Platform.OS === "ios") {
            const pull = -e.nativeEvent.contentOffset.y;
            if (pull >= 80) {
              triggerRefreshHaptic();
              refetchByUser();
            }
          }
        }}
        recycleItems={false}
        renderItem={renderItem}
        {...(Platform.OS === "android"
          ? {
              onRefresh,
              progressViewOffset: 0,
              refreshing: isRefetchingByUser,
            }
          : {})}
      />
      <PullToRefreshIndicator refreshing={isRefetchingByUser} />
    </View>
  );
};
