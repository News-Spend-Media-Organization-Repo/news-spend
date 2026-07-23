import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import { PressableFeedback } from "heroui-native/pressable-feedback";
import { CaretDownIcon } from "phosphor-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  FadeOutUp,
  LayoutAnimationConfig,
} from "react-native-reanimated";
import { useSnapshot } from "valtio";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";
import {
  hideLiveBanner,
  liveBannerState,
  showLiveBanner,
} from "#/state/route-state";

type LiveBannerProps = {
  currentTabName: string;
  isTabBarVisible: boolean;
  navigation: BottomTabBarProps["navigation"];
};

function LiveBanner({
  currentTabName,
  isTabBarVisible,
  navigation,
}: LiveBannerProps) {
  const { isHidden } = useSnapshot(liveBannerState);
  const [index, setIndex] = useState(0);
  const prevIdRef = useRef<string>(null);
  const isEnabled = !isHidden && isTabBarVisible;

  const { data, isLoading, refetch } = useQuery(
    orpc.news.liveVideos.queryOptions({
      meta: { persist: false },
      select: (news) => news?.docs,
      enabled: isEnabled,
    })
  );

  const liveQuery = useQuery(
    orpc.publisher.onMessage.experimental_liveOptions({
      input: { channel: "live-news" },
      retry: true,
      enabled: isEnabled,
    })
  );

  useEffect(() => {
    if (liveQuery.data?.id !== prevIdRef.current && isEnabled) {
      refetch();
      prevIdRef.current = liveQuery.data?.id ?? null;
    }
  }, [liveQuery.data, isEnabled, refetch]);

  useEffect(() => {
    if (!isEnabled || (data?.length ?? 0) <= 1) {
      return;
    }

    const timer = setTimeout(() => {
      setIndex((prev) => {
        const length = data?.length ?? 0;
        return prev === length - 1 ? 0 : prev + 1;
      });
    }, 4000);

    return () => clearTimeout(timer);
  }, [data, isEnabled, index]);

  useEffect(() => {
    if (data && index >= data.length) {
      setIndex(0);
    }
  }, [data, index]);

  // Reset hide state when there's no live data
  useEffect(() => {
    if (!isLoading && (!data || data.length === 0)) {
      showLiveBanner();
    }
  }, [isLoading, data]);

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

  if (isHidden || isLoading || !data || data.length === 0) {
    return null;
  }

  return (
    <Animated.View
      className="bg-white"
      entering={FadeInDown.duration(300).easing(Easing.ease)}
      exiting={FadeOutDown.easing(Easing.ease).duration(300)}
    >
      <View className="flex-row justify-between bg-red-500 px-3">
        <Pressable
          className="flex-1 flex-row items-center gap-2 py-3"
          onPress={onLivePress}
        >
          <View className="size-2 rounded-full bg-white" />
          <Text className="text-background">LIVE</Text>
        </Pressable>
        <PressableFeedback
          className="flex-row items-center justify-center gap-2 py-3"
          onPress={hideLiveBanner}
        >
          <Text className="text-background">HIDE</Text>
          <Icon color="#fff" name={CaretDownIcon} size={18} />
        </PressableFeedback>
      </View>
      <Pressable className="bg-p-400 px-4 py-2" onPress={onLivePress}>
        <View className="h-14 justify-center overflow-hidden">
          <LayoutAnimationConfig skipEntering>
            <Animated.Text
              className="text-[16px] text-background"
              entering={FadeInDown.duration(300).easing(Easing.ease)}
              exiting={FadeOutUp.duration(200).easing(Easing.ease)}
              key={data[index]?.slug}
              numberOfLines={2}
            >
              LIVE NOW: {data[index]?.title}
            </Animated.Text>
          </LayoutAnimationConfig>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default LiveBanner;
