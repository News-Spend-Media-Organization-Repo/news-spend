import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useNavigationState } from "@react-navigation/native";
import { View } from "react-native";
import { useSnapshot } from "valtio";
import MusicPlayer from "#/components/MusicPlayer";
import { tabBarState } from "#/state/route-state";
import LiveBanner from "./live-banner";

type FloatingOverlaysProps = {
  navigation: BottomTabBarProps["navigation"];
};

export function FloatingOverlays({ navigation }: FloatingOverlaysProps) {
  const { height: tabBarHeight } = useSnapshot(tabBarState);
  const currentTabName = useNavigationState(
    (state) => state?.routes[state.index]?.name ?? ""
  );

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
      <LiveBanner currentTabName={currentTabName} navigation={navigation} />
    </View>
  );
}
