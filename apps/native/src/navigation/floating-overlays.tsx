import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useNavigationState } from "@react-navigation/native";
import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSnapshot } from "valtio";
import MusicPlayer from "#/components/MusicPlayer";
import { tabBarState } from "#/state/route-state";
import LiveBanner from "./live-banner";

type FloatingOverlaysProps = {
  navigation: BottomTabBarProps["navigation"];
  isTabBarVisible: boolean;
};

export function FloatingOverlays({
  navigation,
  isTabBarVisible,
}: FloatingOverlaysProps) {
  const { height: tabBarHeight } = useSnapshot(tabBarState);
  const currentTabName = useNavigationState(
    (state) => state?.routes[state.index]?.name ?? ""
  );

  const opacity = useSharedValue(isTabBarVisible ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(isTabBarVisible ? 1 : 0, { duration: 300 });
  }, [isTabBarVisible, opacity]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (tabBarHeight === 0) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents={isTabBarVisible ? "box-none" : "none"}
      style={[
        {
          position: "absolute",
          bottom: tabBarHeight,
          left: 0,
          right: 0,
        },
        animatedStyle,
      ]}
    >
      <MusicPlayer />
      <LiveBanner
        currentTabName={currentTabName}
        isTabBarVisible={isTabBarVisible}
        navigation={navigation}
      />
    </Animated.View>
  );
}
