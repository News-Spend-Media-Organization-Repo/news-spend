import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { useLinkBuilder } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { cn, PressableFeedback } from "heroui-native";
import { CaretDownIcon } from "phosphor-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSnapshot } from "valtio";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import MusicPlayer from "#/components/MusicPlayer";
import { orpc } from "#/lib/orpc";
import { routeState } from "#/state/route-state";

function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { buildHref } = useLinkBuilder();
  const currentTabName = state.routes[state.index].name;
  const { routeName } = useSnapshot(routeState);
  const [isLiveSectionVisible, setIsLiveSectionVisible] = useState(true);
  const isTabBarVisible = useMemo(
    () => ["NewsHome", "LiveHome", "ShopHome", "DiscoverHome"].includes(routeName ?? ""),
    [routeName],
  );

  const { data, isLoading, refetch } = useQuery(
    orpc.news.liveVideos.queryOptions({
      meta: { persist: false },
      select: (news) => news?.docs,
      enabled: isLiveSectionVisible && isTabBarVisible,
    }),
  );

  const prevIdRef = useRef<string>(null);

  const query = useQuery(
    orpc.publisher.onMessage.experimental_liveOptions({
      input: { channel: "live-news" },
      retry: true, // Infinite retry for more reliable streaming
    }),
  );

  useEffect(() => {
    if (
      query.data?.id !== prevIdRef.current && // Only alert on new id
      isLiveSectionVisible &&
      isTabBarVisible
    ) {
      refetch();
      prevIdRef.current = query.data?.id ?? null;
    }
  }, [query.data, isLiveSectionVisible, isTabBarVisible]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!(isLiveSectionVisible && isTabBarVisible) || (data?.length ?? 0) <= 1) {
      return;
    }

    const timer = setTimeout(() => {
      setIndex((prev) => {
        const length = data?.length ?? 0;
        return prev === length - 1 ? 0 : prev + 1;
      });
    }, 4000);

    return () => clearTimeout(timer);
  }, [data, isLiveSectionVisible, isTabBarVisible]);

  useEffect(() => {
    if (data && index >= data.length) {
      setIndex(0);
    }
  }, [data, index]);

  const onLivePress = useCallback(() => {
    if (!data) {
      return;
    }

    navigation.navigate(currentTabName, {
      screen: "SingleLive",
      initial: false,
      params: {
        slug: data[index].slug,
        id: data[index].id,
      },
    });
  }, [data, navigation, index, currentTabName]);

  if (!isTabBarVisible) {
    return null;
  }

  return (
    <>
      <MusicPlayer />
      {isLiveSectionVisible && !isLoading && data && data?.length > 0 && (
        <Animated.View
          className="bg-background"
          entering={FadeInDown.duration(300).easing(Easing.ease)}
          exiting={FadeOutDown.easing(Easing.ease).duration(300)}
        >
          <View className="flex-row justify-between bg-red-500 px-3">
            <PressableFeedback
              className="flex-1 flex-row items-center gap-2 py-3"
              onPress={onLivePress}
            >
              <View className="size-2 rounded-full bg-white" />
              <Text className="text-background">LIVE</Text>
            </PressableFeedback>
            <PressableFeedback
              className="flex-row items-center justify-center gap-2 py-3"
              onPress={() => setIsLiveSectionVisible((prev) => !prev)}
            >
              <Text className="text-background">HIDE</Text>

              <Icon color="#fff" name={CaretDownIcon} size={18} />
            </PressableFeedback>
          </View>
          <PressableFeedback className="bg-p-400 p-4" onPress={onLivePress}>
            <Text className="text-[16px] text-background" key={index} numberOfLines={2}>
              LIVE NOW: {data?.[index]?.title}
            </Text>
          </PressableFeedback>
        </Animated.View>
      )}
      <Animated.View
        className="flex-row bg-p-500 pt-2 pb-safe-offset-2"
        entering={FadeInDown.duration(300).easing(Easing.ease)}
        exiting={FadeOutDown.easing(Easing.ease).duration(300)}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? options.title ?? route.name;

          const isFocused = state.index === index;

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
              key={index}
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
                  size={label === "Settings" ? 56 : 25}
                  style={{
                    alignSelf: "center",
                  }}
                />
              )}
              {label === "Settings" ? null : (
                <Text
                  className={cn(
                    "text-center text-background text-xs",
                    isFocused ? "font-semibold text-background" : "text-gray-500",
                  )}
                >
                  {label}
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
