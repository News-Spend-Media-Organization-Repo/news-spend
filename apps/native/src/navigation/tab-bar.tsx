import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import {
  getFocusedRouteNameFromRoute,
  useLinkBuilder,
} from "@react-navigation/native";
import { cn } from "heroui-native";
import { memo, useCallback } from "react";
import type { LayoutChangeEvent } from "react-native";
import { View } from "react-native";
import { Text } from "#/components/heroui/text";
import { setTabBarHeight } from "#/state/route-state";
import { FloatingOverlays } from "./floating-overlays";

// Root screen of each tab where the tab bar should show, plus the tab's own
// route name (Home/Live/Shop/Discover). Both are needed: tabs are lazy by
// default, so on a tab's first focus its nested stack hasn't mounted/reported
// state back yet, and getFocusedRouteNameFromRoute briefly returns undefined
// for that one render — falling back to the tab's own name. Without the tab
// names here too, that render would incorrectly hide the tab bar for a frame
// before the nested stack resolves and it pops back — a visible flicker.
// Deliberately excludes Settings/SettingsHome — the tab bar is never shown
// anywhere in the Settings tab, including its own root.
const TAB_ROOT_ROUTES = new Set([
  "NewsHome",
  "LiveHome",
  "ShopHome",
  "DiscoverHome",
  "Home",
  "Live",
  "Shop",
  "Discover",
]);

function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const currentRoute = state.routes[state.index];
  const focusedRouteName = getFocusedRouteNameFromRoute(currentRoute);
  const isTabBarVisible = TAB_ROOT_ROUTES.has(
    focusedRouteName ?? currentRoute.name
  );

  const { buildHref } = useLinkBuilder();

  const onTabBarLayout = useCallback((event: LayoutChangeEvent) => {
    setTabBarHeight(event.nativeEvent.layout.height);
  }, []);

  return (
    <>
      {isTabBarVisible && (
        <>
          <FloatingOverlays
            isTabBarVisible={isTabBarVisible}
            navigation={navigation}
          />

          <View
            className="flex-row bg-p-500 pt-2 pb-safe-offset-2"
            onLayout={onTabBarLayout}
          >
            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key];
              const label = options.tabBarLabel ?? options.title ?? route.name;
              const isFocused = state.index === index;
              const isSettings = route.name === "Settings";

              const onPress = () => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!(isFocused || event.defaultPrevented)) {
                  navigation.navigate(route.name, route.params);
                }
              };

              const onLongPress = () => {
                navigation.emit({
                  type: "tabLongPress",
                  target: route.key,
                });
              };

              return (
                <PlatformPressable
                  accessibilityLabel={options.tabBarAccessibilityLabel}
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  href={buildHref(route.name, route.params)}
                  key={route.key}
                  onLongPress={onLongPress}
                  onPress={onPress}
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {options.tabBarIcon && (
                    <options.tabBarIcon
                      color={isFocused ? "#fff" : "gray"}
                      focused={isFocused}
                      size={isSettings ? 56 : 25}
                      style={{ alignSelf: "center" }}
                    />
                  )}
                  {isSettings ? null : (
                    <Text
                      className={cn(
                        "text-center text-xs",
                        isFocused
                          ? "font-semibold text-background"
                          : "text-gray-500"
                      )}
                    >
                      {typeof label === "string" ? label : route.name}
                    </Text>
                  )}
                </PlatformPressable>
              );
            })}
          </View>
        </>
      )}
    </>
  );
}

export default memo(TabBar);
