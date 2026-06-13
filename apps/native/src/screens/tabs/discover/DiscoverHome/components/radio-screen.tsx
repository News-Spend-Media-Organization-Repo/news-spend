import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { useQuery } from "@tanstack/react-query";
import { MusicNoteIcon } from "phosphor-react-native";
import type { Station } from "radio-browser-api";
import { memo, useCallback, useMemo } from "react";
import { ActivityIndicator, RefreshControl, type ScrollViewProps, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";

import { Button } from "#/components/heroui/button";
import { Text } from "#/components/heroui/text";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";

import { StationItem } from "./radio-station-item";

// Memoized section header to prevent unnecessary re-renders
const SectionHeader = memo(({ title }: { title: string }) => (
  <View className="my-2.5 flex-row items-center gap-2 px-4">
    <MusicNoteIcon color="#5D3FD3" size={18} weight="fill" />
    <Text className="font-semibold text-gray-800 text-lg">{title}</Text>
  </View>
));

// Memoized station list to prevent unnecessary re-renders
const StationList = memo(({ stations }: { stations: Station[] }) => {
  const renderStationItem = useCallback(
    ({ item }: LegendListRenderItemProps<Station>) => (
      <StationItem item={item} stationList={stations} />
    ),
    [stations],
  );

  // Memoize the separator component
  const ItemSeparator = useMemo(() => () => <View className="w-4" />, []);

  // Memoize the key extractor
  const keyExtractor = useCallback((item: Station) => item.id, []);

  // Memoize the custom scroll view
  const CustomScrollView = useCallback((props: ScrollViewProps) => <ScrollView {...props} />, []);

  return (
    <LegendList
      contentContainerStyle={{
        paddingLeft: 16,
        paddingRight: 8,
      }}
      data={stations}
      estimatedItemSize={200}
      horizontal
      ItemSeparatorComponent={ItemSeparator}
      keyExtractor={keyExtractor}
      recycleItems
      renderItem={renderStationItem}
      renderScrollComponent={CustomScrollView}
      showsHorizontalScrollIndicator={false}
      style={{ height: 200 }}
    />
  );
});

export const RadioStationsScreen = () => {
  // Memoize the transform function to prevent recreation
  const transformData = useCallback(
    (
      data: {
        stations: Station[];
        displayName: string;
      }[],
    ) =>
      data?.reduce<(string | Station[])[]>((acc, section) => {
        acc.push(section.displayName);
        acc.push(section.stations);
        return acc;
      }, []),
    [],
  );

  const { data, isPending, isError, refetch } = useQuery(
    orpc.radioStation.byGenreGroup.queryOptions({
      select: transformData,
      staleTime: 5 * 60 * 1000,
    }),
  );

  // Memoize the retry function
  const retryQueries = useCallback(() => {
    if (isError) {
      refetch();
    }
  }, [isError, refetch]);

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  // Memoize the refresh control
  const refreshControl = useMemo(
    () => <RefreshControl onRefresh={refetchByUser} refreshing={isRefetchingByUser} />,
    [isRefetchingByUser, refetchByUser],
  );

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center p-5">
        <ActivityIndicator color="#5D3FD3" size="large" />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View className="flex-1 items-center justify-center p-5">
        <Text className="text-center text-base text-red-500">
          Failed to load radio stations. Please check your connection.
        </Text>
        <Button onPress={retryQueries} size="sm" variant="primary">
          <Button.Label>Retry</Button.Label>
        </Button>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-100"
      contentContainerStyle={{ paddingVertical: 16 }}
      refreshControl={refreshControl}
    >
      {data?.map((item) => {
        if (typeof item === "string") {
          return <SectionHeader key={item} title={item} />;
        }
        return (
          <StationList
            key={item.length > 0 ? `stations-${item[0].id}` : "empty-stations"}
            stations={item}
          />
        );
      })}
    </ScrollView>
  );
};
