import { View } from "react-native";
import MusicPlayer from "#/components/MusicPlayer";

/**
 * Pure content: MusicPlayer. Positioning, sizing, and the
 * show/hide animation all live in the parent (TabBar), which renders this
 * as a sibling of the tab button row inside one shared animated wrapper, so
 * the two slide/fade together and the wrapper's single onLayout measures
 * their combined height. MusicPlayer already returns null
 * when it has nothing to show, so this contributes zero height then.
 */
export function FloatingOverlays() {
  return (
    <View className="">
      <MusicPlayer />
    </View>
  );
}
