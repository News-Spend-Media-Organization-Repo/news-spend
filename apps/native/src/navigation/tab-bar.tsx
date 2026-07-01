import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { useLinkBuilder } from "@react-navigation/native";
import { cn } from "heroui-native";
import { memo } from "react";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { Text } from "#/components/heroui/text";
import MusicPlayer from "#/components/MusicPlayer";
import LiveBanner from "./live-banner";

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

  const currentTabName = state.routes[state.index].name;

  const _tabBarStyle = useAnimatedStyle(() => ({
    // height: withTiming(isTabBarVisible ? TAB_BAR_HEIGHT : 0, { duration: 250, easing: Easing.ease }),
    opacity: withTiming(isTabBarVisible ? 1 : 0, { duration: 200 }),
    // backgroundColor: "#YOUR_P_500_HEX", // explicit, always set
    overflow: "hidden",
  }));

  if (!isTabBarVisible) {
    return null;
  }

  return (
    <>
      <Animated.View
        entering={FadeInDown.duration(300).easing(Easing.ease)}
        exiting={FadeOutDown.easing(Easing.ease).duration(300)}
        style={{ backgroundColor: "transparent" }}
      >
        <MusicPlayer />
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(300).easing(Easing.ease)}
        exiting={FadeOutDown.easing(Easing.ease).duration(300)}
        style={{ backgroundColor: "transparent" }}
      >
        <LiveBanner currentTabName={currentTabName} navigation={navigation} />
      </Animated.View>

      <Animated.View
        className="flex-row bg-p-500 pt-2 pb-safe-offset-2"
        entering={FadeInDown.duration(300).easing(Easing.ease)}
        exiting={FadeOutDown.easing(Easing.ease).duration(300)}
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
      </Animated.View>
    </>
  );
}

export default memo(TabBar);
