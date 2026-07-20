import { CheckCircleIcon, MusicNoteIcon } from "phosphor-react-native";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { TabLegendList } from "react-native-collapsible-tab/legend-list";

import { Button } from "#/components/heroui/button";
import { ProgressBar } from "#/components/heroui/progress";
import { Text } from "#/components/heroui/text";
import { usePlayerState } from "#/state/audioPlayerState";
import { useTabBarHeight } from "#/state/route-state";

import {
  PullToRefreshIndicator,
  triggerRefreshHaptic,
} from "./pull-to-refresh-indicator";
import {
  type RadioSectionItem,
  SectionHeader,
  StationList,
  useRadioStations,
} from "./radio-screen";

const keyExtractor = (item: RadioSectionItem): string => {
  switch (item.type) {
    case "header":
      return `header-${item.title}`;
    case "stations":
      return `stations-${item.key}`;
    default: {
      const _exhaustive: never = item;
      return _exhaustive;
    }
  }
};

export const MusicTab = () => {
  const { listeningTime, pointEarnedToday } = usePlayerState();
  const tabBarHeight = useTabBarHeight();

  const timeInPercentage = useMemo(
    () => Math.round((listeningTime / 1800) * 100),
    [listeningTime]
  );

  const {
    data,
    isPending,
    isError,
    refetch,
    isRefetchingByUser,
    refetchByUser,
    sections,
  } = useRadioStations();

  const renderItem = useCallback(({ item }: { item: RadioSectionItem }) => {
    switch (item.type) {
      case "header":
        return <SectionHeader title={item.title} />;
      case "stations":
        return <StationList stations={item.stations} />;
      default: {
        const _exhaustive: never = item;
        return _exhaustive;
      }
    }
  }, []);

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-5">
        <ActivityIndicator color="#5D3FD3" size="large" />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-5">
        <Text className="text-center text-base text-red-500">
          Failed to load radio stations. Please check your connection.
        </Text>
        <Button onPress={() => refetch()} size="sm" variant="primary">
          <Button.Label>Retry</Button.Label>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <TabLegendList
        contentContainerStyle={{ paddingBottom: 16 + tabBarHeight }}
        data={sections}
        estimatedItemSize={200}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          <View className="m-2 flex-row items-center gap-3 rounded-lg bg-p-400 p-3">
            {pointEarnedToday ? (
              <CheckCircleIcon color="white" size={24} weight="fill" />
            ) : (
              <MusicNoteIcon color="white" size={24} weight="fill" />
            )}
            <View className="flex-1 gap-2">
              <Text className="text-white">
                Play 30 mins of music today and earn 40 points
              </Text>
              <ProgressBar value={timeInPercentage}>
                <ProgressBar.Track className="h-2 rounded-full bg-default">
                  <ProgressBar.Fill className="rounded-full bg-s-200" />
                </ProgressBar.Track>
              </ProgressBar>
            </View>
          </View>
        }
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
};
