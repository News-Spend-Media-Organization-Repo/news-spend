import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const COLORS = ["#F472B6", "#FBBF24", "#34D399", "#818CF8", "#60A5FA"];
const FALL = 260;
const DURATION = 1300;

/** Fixed, spread-out pieces: no randomness, so it looks the same every time. */
const PIECES = Array.from({ length: 18 }, (_, i) => ({
  key: i,
  left: `${(i * 37) % 96}%` as const,
  size: 6 + (i % 3) * 2,
  delay: (i % 6) * 90,
  drift: ((i % 5) - 2) * 14,
  color: COLORS[i % COLORS.length] as string,
}));

function Piece({
  left,
  size,
  delay,
  drift,
  color,
}: Omit<(typeof PIECES)[number], "key">) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: DURATION }));
  }, [delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateY: progress.value * FALL },
      { translateX: progress.value * drift },
      { rotate: `${progress.value * 300}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: -8,
          left,
          width: size,
          height: size * 1.6,
          borderRadius: 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/**
 * A short burst behind the sheet's content, played once when it mounts.
 *
 * It sits behind the controls and ignores touches, so it can never get in the
 * way of a button, and it is skipped entirely when the system asks for reduced
 * motion.
 */
export function Confetti() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (active) {
          setEnabled(!reduced);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!enabled) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      testID="confetti"
    >
      {PIECES.map(({ key, ...piece }) => (
        <Piece key={key} {...piece} />
      ))}
    </View>
  );
}
