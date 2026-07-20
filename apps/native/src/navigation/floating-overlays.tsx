import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useNavigationState } from "@react-navigation/native";
import MusicPlayer from "#/components/MusicPlayer";
import LiveBanner from "./live-banner";

type FloatingOverlaysProps = {
  navigation: BottomTabBarProps["navigation"];
  isTabBarVisible: boolean;
};

/**
 * Pure content — MusicPlayer + LiveBanner. Positioning, sizing, and the
 * show/hide animation all live in the parent (TabBar), which renders this
 * as a sibling of the tab button row inside one shared animated wrapper, so
 * the two slide/fade together and the wrapper's single onLayout measures
 * their combined height. MusicPlayer/LiveBanner each already return null
 * when they have nothing to show, so this contributes zero height then.
 */
export function FloatingOverlays({
  navigation,
  isTabBarVisible,
}: FloatingOverlaysProps) {
  const currentTabName = useNavigationState(
    (state) => state?.routes[state.index]?.name ?? ""
  );

  return (
    <>
      <MusicPlayer />
      <LiveBanner
        currentTabName={currentTabName}
        isTabBarVisible={isTabBarVisible}
        navigation={navigation}
      />
    </>
  );
}
