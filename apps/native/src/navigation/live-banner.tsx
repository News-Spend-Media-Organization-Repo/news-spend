import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import { PressableFeedback } from "heroui-native/pressable-feedback";
import { CaretDownIcon } from "phosphor-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, FadeInDown, FadeOutDown } from "react-native-reanimated";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";

type LiveBannerProps = {
  currentTabName: string;
  navigation: BottomTabBarProps["navigation"];
};

function LiveBanner({ currentTabName, navigation }: LiveBannerProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [index, setIndex] = useState(0);
  const prevIdRef = useRef<string>(null);

  const { data, isLoading, refetch } = useQuery(
    orpc.news.liveVideos.queryOptions({
      meta: { persist: false },
      select: (news) => news?.docs,
      enabled: isVisible,
    }),
  );

  const liveQuery = useQuery(
    orpc.publisher.onMessage.experimental_liveOptions({
      input: { channel: "live-news" },
      retry: true,
    }),
  );

  useEffect(() => {
    if (liveQuery.data?.id !== prevIdRef.current && isVisible) {
      refetch();
      prevIdRef.current = liveQuery.data?.id ?? null;
    }
  }, [liveQuery.data, isVisible, refetch]);

  useEffect(() => {
    if (!isVisible || (data?.length ?? 0) <= 1) {
      return;
    }

    const timer = setTimeout(() => {
      setIndex((prev) => {
        const length = data?.length ?? 0;
        return prev === length - 1 ? 0 : prev + 1;
      });
    }, 4000);

    return () => clearTimeout(timer);
  }, [data, index, isVisible]);

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

  if (!isVisible || isLoading || !data || data.length === 0) {
    return null;
  }

  return (
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
          onPress={() => setIsVisible((prev) => !prev)}
        >
          <Text className="text-background">HIDE</Text>
          <Icon color="#fff" name={CaretDownIcon} size={18} />
        </PressableFeedback>
      </View>
      <PressableFeedback className="bg-p-400 p-4" onPress={onLivePress}>
        <Text className="text-[16px] text-background" key={index} numberOfLines={2}>
          LIVE NOW: {data[index]?.title}
        </Text>
      </PressableFeedback>
    </Animated.View>
  );
}

export default LiveBanner;
