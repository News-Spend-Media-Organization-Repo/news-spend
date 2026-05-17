import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { Music } from "@tamagui/lucide-icons";
import { useQuery } from "@tanstack/react-query";
import type { Station } from "radio-browser-api";
import { memo, useCallback, useMemo } from "react";
import { ActivityIndicator, RefreshControl, type ScrollViewProps } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Stack, Text, XStack } from "tamagui";

import { Button } from "#/components/ui";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";

import { StationItem } from "./RadioStationItem";

// Memoized section header to prevent unnecessary re-renders
const SectionHeader = memo(({ title }: { title: string }) => (
  <XStack ai="center" gap="$2" my={10} px={16}>
    <Music color="#5D3FD3" size={18} />
    <Text color="#333" fos={18} fow="600">
      {title}
    </Text>
  </XStack>
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
  const ItemSeparator = useMemo(() => () => <Stack w={16} />, []);

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

  // Memoize the section render function
  const sectionRender = useCallback(({ item }: { item: string | Station[] }) => {
    if (typeof item === "string") {
      return <SectionHeader title={item} />;
    }
    return <StationList stations={item} />;
  }, []);

  // Memoize the key extractor for sections
  const sectionKeyExtractor = useCallback((item: string | Station[]) => {
    if (typeof item === "string") {
      return item;
    }
    return item.length > 0 ? `stations-${item[0].id}` : "empty-stations";
  }, []);

  // Memoize the refresh control
  const refreshControl = useMemo(
    () => <RefreshControl onRefresh={refetchByUser} refreshing={isRefetchingByUser} />,
    [isRefetchingByUser, refetchByUser],
  );

  // Memoize the content container style
  const contentContainerStyle = useMemo(() => ({ paddingVertical: 16 }), []);

  if (isPending) {
    return (
      <Stack ai="center" flex={1} jc="center" p={20}>
        <ActivityIndicator color="#5D3FD3" size="large" />
      </Stack>
    );
  }

  if (isError && !data) {
    return (
      <Stack ai="center" flex={1} jc="center" p={20}>
        <Text color="#ff4757" fos={16} ta="center">
          Failed to load radio stations. Please check your connection.
        </Text>
        <Button onPress={retryQueries}>
          <Button.Text>Retry</Button.Text>
        </Button>
      </Stack>
    );
  }

  return (
    <Stack bg="#f8f9fa" flex={1}>
      <LegendList
        contentContainerStyle={contentContainerStyle}
        data={data}
        estimatedItemSize={200}
        keyExtractor={sectionKeyExtractor}
        refreshControl={refreshControl}
        renderItem={sectionRender}
      />
    </Stack>
  );
};
