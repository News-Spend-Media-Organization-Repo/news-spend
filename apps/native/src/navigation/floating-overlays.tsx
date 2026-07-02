import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import { View } from "react-native";
import { useSnapshot } from "valtio";
import MusicPlayer from "#/components/MusicPlayer";
import { tabBarState } from "#/state/route-state";
import LiveBanner from "./live-banner";

export function FloatingOverlays() {
  const { height: tabBarHeight } = useSnapshot(tabBarState);
  const navigation = useNavigation();
  const currentTabName = useNavigationState(
    (state) => state?.routes[state.index]?.name ?? ""
  );

  const tabNavigation =
    navigation as unknown as BottomTabBarProps["navigation"];

  if (tabBarHeight === 0) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: tabBarHeight,
        left: 0,
        right: 0,
      }}
    >
      <MusicPlayer />
      <LiveBanner currentTabName={currentTabName} navigation={tabNavigation} />
    </View>
  );
}
