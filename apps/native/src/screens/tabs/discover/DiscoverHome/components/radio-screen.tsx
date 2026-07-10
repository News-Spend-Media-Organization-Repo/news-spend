import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useQuery } from "@tanstack/react-query";
import { MusicNoteIcon } from "phosphor-react-native";
import type { Station } from "radio-browser-api";
import { useCallback, useMemo } from "react";
import { type ScrollViewProps, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";

import { Text } from "#/components/heroui/text";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";

import { StationItem } from "./radio-station-item";

export type RadioSectionItem =
  | { type: "header"; title: string }
  | { type: "stations"; stations: Station[]; key: string };

export function SectionHeader({ title }: { title: string }) {
  return (
    <View className="my-2.5 flex-row items-center gap-2 px-4">
      <MusicNoteIcon color="#5D3FD3" size={18} weight="fill" />
      <Text className="font-semibold text-gray-800 text-lg">{title}</Text>
    </View>
  );
}

export function StationList({ stations }: { stations: Station[] }) {
  const renderStationItem = useCallback(
    ({ item }: LegendListRenderItemProps<Station>) => (
      <StationItem item={item} stationList={stations} />
    ),
    [stations]
  );

  const ItemSeparator = useMemo(() => () => <View className="w-4" />, []);
  const keyExtractor = useCallback((item: Station) => item.id, []);
  const CustomScrollView = useCallback(
    (props: ScrollViewProps) => <ScrollView {...props} />,
    []
  );

  return (
    <LegendList
      contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}
      data={stations}
      estimatedItemSize={200}
      horizontal
      ItemSeparatorComponent={ItemSeparator}
      keyExtractor={keyExtractor}
      renderItem={renderStationItem}
      renderScrollComponent={CustomScrollView}
      showsHorizontalScrollIndicator={false}
      style={{ height: 150 }}
    />
  );
}

type GenreGroup = { stations: Station[]; displayName: string };

export function useRadioStations() {
  const { data, isPending, isError, refetch } = useQuery(
    orpc.radioStation.byGenreGroup.queryOptions({
      staleTime: 5 * 60 * 1000,
    })
  );

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  const sections: RadioSectionItem[] = useMemo(() => {
    const groups = (data ?? []) as GenreGroup[];
    const items: RadioSectionItem[] = [];
    for (const group of groups) {
      items.push({ type: "header", title: group.displayName });
      items.push({
        type: "stations",
        stations: group.stations,
        key:
          group.stations.length > 0
            ? (group.stations[0]?.id ?? group.displayName)
            : `empty-${group.displayName}`,
      });
    }
    return items;
  }, [data]);

  return {
    data,
    isPending,
    isError,
    refetch,
    isRefetchingByUser,
    refetchByUser,
    sections,
  };
}
