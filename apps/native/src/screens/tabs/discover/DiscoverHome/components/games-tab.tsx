import { useCallback } from "react";
import { View } from "react-native";
import { TabLegendList } from "react-native-collapsible-tab/legend-list";
import { GAMES, type Game } from "#/features/games/catalog";
import { openGame } from "#/features/games/openGame";
import { useTabBarHeight } from "#/state/route-state";
import { GameItem } from "./game-item";

/**
 * Every game the app offers: a fixed, reviewed list (see features/games/catalog)
 * rather than a feed, so the list can be indexed for Apple and nothing appears
 * that has not been looked at. Being static it needs no loading state and no
 * pull to refresh.
 */
export function GamesTab() {
  const tabBarHeight = useTabBarHeight();

  const renderItem = useCallback(
    ({ item }: { item: Game }) => (
      <GameItem item={item} onPress={() => openGame(item.namespace, "games")} />
    ),
    []
  );

  return (
    <View className="flex-1">
      <TabLegendList
        contentContainerStyle={{ paddingBottom: 25 + tabBarHeight }}
        data={GAMES}
        estimatedItemSize={120}
        keyExtractor={(item: Game) => item.id}
        recycleItems={false}
        renderItem={renderItem}
      />
    </View>
  );
}
