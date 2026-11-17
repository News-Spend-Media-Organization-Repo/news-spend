import type { LegendListRenderItemProps } from "@legendapp/list/react-native";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { TabLegendList } from "react-native-collapsible-tab/legend-list";
import { Button } from "#/components/heroui/button";
import { Text } from "#/components/heroui/text";
import { useEvents } from "#/hooks/discover/useEvents";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { trackDiscover } from "#/lib/discoverAnalyticsClient";
import { useTabBarHeight } from "#/state/route-state";
import {
  PullToRefreshIndicator,
  triggerRefreshHaptic,
} from "../DiscoverHome/components/pull-to-refresh-indicator";
import { EventRow, type EventRowEvent } from "./EventRow";

export function EventsScreen() {
  const navigation = useNavigation("DiscoverHome");
  const tabBarHeight = useTabBarHeight();
  const {
    data,
    isPending,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useEvents();
  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  const events = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data]
  );

  const openEvent = useCallback(
    (item: EventRowEvent) => {
      trackDiscover({
        event: "open",
        itemType: "event",
        itemId: item.id,
        section: "events",
      });
      navigation.navigate("EventDetail", { id: item.id });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<EventRowEvent>) => (
      <EventRow event={item} onPress={() => openEvent(item)} />
    ),
    [openEvent]
  );

  const keyExtractor = useCallback((item: EventRowEvent) => item.id, []);

  const emptyList = useCallback(
    () => (
      <View className="flex-1 items-center justify-center gap-2 py-16">
        <Text className="text-base">
          {isError ? "We couldn't load events" : "No events near you"}
        </Text>
        {isError ? (
          <>
            <Text className="text-center text-sm text-subtle-text">
              Check your connection and try again.
            </Text>
            <Button className="mt-2" onPress={() => refetch()}>
              <Button.Label>Retry</Button.Label>
            </Button>
          </>
        ) : null}
      </View>
    ),
    [isError, refetch]
  );

  const footer = useCallback(
    () => (
      <View className="items-center py-4">
        {isFetchingNextPage ? <ActivityIndicator /> : null}
      </View>
    ),
    [isFetchingNextPage]
  );

  const onEndReached = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  if (isPending) {
    return <ActivityIndicator />;
  }

  return (
    <View className="flex-1">
      <TabLegendList
        contentContainerStyle={{ paddingBottom: tabBarHeight }}
        data={events}
        estimatedItemSize={92}
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
              onRefresh: refetchByUser,
              progressViewOffset: 0,
              refreshing: isRefetchingByUser,
            }
          : {})}
      />
      <PullToRefreshIndicator refreshing={isRefetchingByUser} />
    </View>
  );
}
