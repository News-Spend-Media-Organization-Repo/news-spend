import type { NewsCategory } from "@news-spend-media/payload/types";
import { useScrollToTop } from "@react-navigation/native";
import type { FlashList, FlashListRef } from "@shopify/flash-list";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { useMMKVObject } from "react-native-mmkv";
import {
  type Route,
  TabBar,
  TabBarIndicator,
  TabView,
} from "react-native-tab-view";
import { Spinner, useTheme, XStack } from "tamagui";

import Latest from "#/components/News/categories/Latest";
import NewsCategoryComponent from "#/components/News/categories/NewsCategory";
import { setTabName } from "#/state/route-state";

export default function NewsHome() {
  const [index, setIndex] = useState(0);
  const layout = useWindowDimensions();
  const theme = useTheme();

  const [categories] = useMMKVObject<NewsCategory["items"]>("CATEGORIES");

  const routes = useMemo<Route[]>(
    () => [
      { key: "latest", title: "Latest" },
      ...(categories ?? []).map(
        (item, key): Route => ({
          key:
            typeof item.category === "string"
              ? item.category
              : (item.category?.id ??
                item.category?.title ??
                `category-${key}`),
          title:
            typeof item.category === "string"
              ? item.category
              : item.category?.title,
        })
      ),
    ],
    [categories]
  );

  // Create refs object for all lists
  const listRefs = useRef<Record<string, FlashListRef<any>>>({});

  // Ref for the active list that will work with useScrollToTop
  const activeListRef = useRef<FlashListRef<any>>(null);

  // Update active ref when index changes
  useEffect(() => {
    activeListRef.current = listRefs.current[routes[index].key];
  }, [index, routes]);

  useScrollToTop(activeListRef);

  const createSetRef = useCallback(
    (routeKey: string) => (ref: FlashListRef<any> | null) => {
      if (ref) {
        listRefs.current[routeKey] = ref;
        if (routes[index].key === routeKey) {
          activeListRef.current = ref;
        }
      }
    },
    [index, routes]
  );

  const renderScene = useCallback(
    ({ route }: { route: Route }) => {
      switch (route.key) {
        case "latest":
          return <Latest ref={createSetRef("latest")} />;
        default:
          return (
            <NewsCategoryComponent
              ref={createSetRef(route.key)}
              route={route.key}
            />
          );
      }
    },
    [routes, createSetRef]
  );

  const onIndexChange = useCallback(
    (newIndex: number) => {
      setIndex(newIndex);
      setTabName(routes[newIndex].key);
    },
    [routes]
  );

  const renderTabBar = useCallback(
    (props: any) => (
      <TabBar
        {...props}
        bounces
        inactiveColor="gray"
        indicatorStyle={{
          backgroundColor: theme.s50.val,
        }}
        pressColor="transparent"
        renderIndicator={(indicatorProps) => {
          const width = indicatorProps.getTabWidth(index) - 10;
          return <TabBarIndicator {...indicatorProps} width={width} />;
        }}
        scrollEnabled
        style={{
          backgroundColor: theme.p500.val,
          height: 35,
        }}
        tabStyle={{
          width: "auto",
          padding: 0,
        }}
      />
    ),
    [theme, index]
  );

  return (
    <TabView
      commonOptions={{
        labelStyle: {
          color: theme.s50.val,
          fontSize: 14,
          fontFamily: "Inter-SemiBold",
          textTransform: "capitalize",
        },
      }}
      initialLayout={{ width: layout.width, height: 0 }}
      lazy
      navigationState={{ index, routes }}
      onIndexChange={onIndexChange}
      pagerStyle={{ zIndex: -3 }}
      renderLazyPlaceholder={() => (
        <XStack ai="center" backgroundColor="$background" flex={1} jc="center">
          <Spinner />
        </XStack>
      )}
      renderScene={renderScene}
      renderTabBar={renderTabBar}
      style={{ zIndex: -3 }}
      swipeEnabled
    />
  );
}
