import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { useLinkBuilder } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Animated, {
  Easing,
  FadeInDown,
  FadeInRight,
  FadeOutDown,
  FadeOutLeft,
  LayoutAnimationConfig,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Circle, SizableText, Stack, Text, XStack } from "tamagui";
import { CaretDown } from "tamagui-phosphor";
import { useSnapshot } from "valtio";

import MusicPlayer from "#/components/MusicPlayer";
import { Button } from "#/components/ui";
import { orpc } from "#/lib/orpc";
import { routeState } from "#/state/route-state";

function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { buildHref } = useLinkBuilder();
  const navigationState = navigation.getState();
  const currentTabName = navigationState.routes[navigationState.index].name;
  const { routeName } = useSnapshot(routeState);
  const [isLiveSectionVisible, setIsLiveSectionVisible] = useState(true);
  const insets = useSafeAreaInsets();
  const isTabBarVisible = useMemo(
    () =>
      ["NewsHome", "LiveHome", "ShopHome", "DiscoverHome"].includes(
        routeName ?? ""
      ),
    [routeName]
  );

  const { data, isLoading, refetch } = useQuery(
    orpc.news.liveVideos.queryOptions({
      meta: { persist: false },
      select: (news) => news?.docs,
      enabled: isLiveSectionVisible && isTabBarVisible,
    })
  );

  const prevIdRef = useRef<string>(null);

  const query = useQuery(
    orpc.publisher.onMessage.experimental_liveOptions({
      input: { channel: "live-news" },
      retry: true, // Infinite retry for more reliable streaming
    })
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
    if (
      !(isLiveSectionVisible && isTabBarVisible) ||
      (data?.length ?? 0) <= 1
    ) {
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
    if (!data) return;

    navigation.navigate(currentTabName, {
      screen: "SingleLive",
      initial: false,
      params: {
        slug: data[index].slug,
        id: data[index].id,
      },
    });
  }, [data, navigation, index, currentTabName]);

  if (!isTabBarVisible) return null;

  return (
    <>
      <MusicPlayer />
      {isLiveSectionVisible && !isLoading && data && data?.length > 0 && (
        <Stack bg="white">
          <Animated.View
            entering={FadeInDown.duration(300).easing(Easing.ease)}
            exiting={FadeOutDown.easing(Easing.ease).duration(300)}
          >
            <XStack ai="center" bg="red" jc="space-between" px="$3">
              <XStack ai="center" gap="$2">
                <Circle bg="$background" size="$0.75" />
                <Text color="$background">LIVE</Text>
              </XStack>
              <Button
                onPress={() => setIsLiveSectionVisible((prev) => !prev)}
                size="$1.5"
                unstyled
              >
                <Button.Text fos="$3">HIDE</Button.Text>
                <Button.Icon color="#fff">
                  <CaretDown size={18} />
                </Button.Icon>
              </Button>
            </XStack>
            <Stack bg="$p400" onPress={onLivePress} p="$3">
              <LayoutAnimationConfig skipEntering skipExiting>
                <Animated.Text
                  entering={FadeInRight}
                  exiting={FadeOutLeft}
                  key={index}
                  numberOfLines={2}
                  style={{
                    color: "white",
                    fontFamily: "Inter-Medium",
                    fontSize: 16,
                  }}
                >
                  LIVE NOW: {data?.[index]?.title}
                </Animated.Text>
              </LayoutAnimationConfig>
            </Stack>
          </Animated.View>
        </Stack>
      )}
      <XStack bg="$color.p500" pb={insets.bottom} pt="$1.5">
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
              {label !== "Settings" ? (
                <SizableText
                  color={isFocused ? "$s50" : "gray"}
                  fontSize={12}
                  lh={15}
                  ta="center"
                >
                  {label}
                </SizableText>
              ) : null}
            </PlatformPressable>
          );
        })}
      </XStack>
    </>
  );
}

export default memo(TabBar);
