import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { useLinkBuilder } from "@react-navigation/native";
import { cn } from "heroui-native";
import { memo, useCallback, useEffect } from "react";
import type { LayoutChangeEvent } from "react-native";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "#/components/heroui/text";
import { setTabBarHeight } from "#/state/route-state";
import { FloatingOverlays } from "./floating-overlays";

const VISIBLE_SCREENS = new Set([
  "NewsHome",
  "LiveHome",
  "ShopHome",
  "DiscoverHome",
]);
const VISIBLE_TABS = new Set(["Home", "Live", "Shop", "Discover"]); // not Settings

function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const currentRoute = state.routes[state.index];
  const nestedState = currentRoute.state;
  const activeRouteName = nestedState
    ? nestedState.routes[nestedState.index ?? 0].name
    : currentRoute.name;

  const { buildHref } = useLinkBuilder();

  const isTabBarVisible = nestedState
    ? VISIBLE_SCREENS.has(activeRouteName)
    : VISIBLE_TABS.has(currentRoute.name);

  const wrapperHeight = useSharedValue(0);
  const translateY = useSharedValue(0);
  useEffect(() => {
    translateY.value = withTiming(isTabBarVisible ? 0 : wrapperHeight.value, {
      duration: 300,
    });
  }, [isTabBarVisible, translateY, wrapperHeight]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const onTabBarLayout = useCallback((event: LayoutChangeEvent) => {
    setTabBarHeight(event.nativeEvent.layout.height);
  }, []);

  const onWrapperLayout = useCallback(
    (event: LayoutChangeEvent) => {
      wrapperHeight.value = event.nativeEvent.layout.height;
    },
    [wrapperHeight]
  );

  return (
    <Animated.View
      onLayout={onWrapperLayout}
      pointerEvents={isTabBarVisible ? "auto" : "none"}
      style={animatedStyle}
    >
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
    </Animated.View>
  );
}

export default memo(TabBar);
