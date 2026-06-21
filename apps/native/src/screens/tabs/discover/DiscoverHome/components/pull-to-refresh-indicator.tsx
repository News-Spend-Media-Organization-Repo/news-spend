import { ActivityIndicator, Platform } from "react-native";
import { useCurrentTabScrollY, useHeaderMeasurements } from "react-native-collapsible-tab";
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from "react-native-reanimated";

import { useTabBarHeight } from "./tab-bar-height-context";

const PULL_THRESHOLD = 80;

type PullToRefreshIndicatorProps = {
  refreshing: boolean;
};

export function PullToRefreshIndicator({ refreshing }: PullToRefreshIndicatorProps) {
  if (Platform.OS !== "ios") {
    return null;
  }
  return <IOSTabPullSpinner refreshing={refreshing} />;
}

function IOSTabPullSpinner({ refreshing }: { refreshing: boolean }) {
  const scrollY = useCurrentTabScrollY();
  const { top: headerTop, height: headerHeight } = useHeaderMeasurements();
  const tabBarHeight = useTabBarHeight();

  const animatedStyle = useAnimatedStyle(() => {
    const pull = Math.max(0, -scrollY.value);
    const progress = refreshing ? 1 : Math.min(pull / PULL_THRESHOLD, 1);
    return {
      opacity: progress,
      top: headerHeight + tabBarHeight + headerTop.value + 8,
      transform: [
        {
          translateY: interpolate(progress, [0, 1], [-20, 16], Extrapolation.CLAMP),
        },
        {
          scale: interpolate(progress, [0, 1], [0.6, 1], Extrapolation.CLAMP),
        },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          alignItems: "center",
          zIndex: 10,
        },
        animatedStyle,
      ]}
    >
      <ActivityIndicator />
    </Animated.View>
  );
}
