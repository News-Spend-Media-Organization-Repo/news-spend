import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { Text, XStack, YStack } from "tamagui";

const __DEV_TRACKER__ = __DEV__;

type Props = {
  elapsedSeconds: number;
  minReadingSeconds: number;
  hasScrolledThreshold: boolean;
  inRapidScroll: boolean;
  isTracking: boolean;
  wordCount?: number;
};

type RowProps = {
  label: string;
  value: string;
  valueColor?: string;
};

const Row = ({ label, value, valueColor = "#e2e2e2" }: RowProps) => (
  <XStack gap="$3" jc="space-between">
    <Text color="#888" fontSize={11}>
      {label}
    </Text>
    <Text color={valueColor} fontSize={11} fontWeight="600">
      {value}
    </Text>
  </XStack>
);

export function ReadingTrackerDebug({
  elapsedSeconds,
  minReadingSeconds,
  hasScrolledThreshold,
  inRapidScroll,
  isTracking,
  wordCount,
}: Props) {
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [visible]);

  // Pulse the indicator dot when tracking is active
  useEffect(() => {
    if (!isTracking) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isTracking]);

  if (!__DEV_TRACKER__) {
    return null;
  }

  const progress = Math.min(elapsedSeconds / minReadingSeconds, 1);
  const progressPct = `${Math.round(progress * 100)}%`;
  const remaining = Math.max(minReadingSeconds - elapsedSeconds, 0);
  const statusColor = inRapidScroll
    ? "#f87171"
    : isTracking
      ? "#4ade80"
      : "#facc15";

  const panelTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [200, 0],
  });

  return (
    <>
      {/* Toggle button */}
      <Pressable
        onPress={() => setVisible((v) => !v)}
        style={styles.toggleButton}
      >
        <Animated.View
          style={[
            styles.dot,
            { backgroundColor: statusColor, opacity: pulseAnim },
          ]}
        />
        <Text color="#e2e2e2" fontSize={10} ml={6}>
          {visible ? "HIDE" : "DBG"}
        </Text>
      </Pressable>

      {/* Debug panel */}
      {visible ? (
        <Animated.View pointerEvents="none" style={[styles.panel]}>
          <YStack gap="$1.5">
            {/* Progress bar */}
            <XStack
              bg="rgba(255,255,255,0.08)"
              borderRadius={3}
              h={4}
              mb="$1"
              overflow="hidden"
              w="100%"
            >
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressPct,
                    backgroundColor: inRapidScroll ? "#f87171" : "#4ade80",
                  },
                ]}
              />
            </XStack>

            <Row label="elapsed" value={`${elapsedSeconds}s`} />
            <Row label="required" value={`${minReadingSeconds}s`} />
            <Row label="remaining" value={`${remaining}s`} />
            <Row label="progress" value={progressPct} />
            {wordCount !== undefined && (
              <Row label="word count" value={String(wordCount)} />
            )}

            <XStack bg="rgba(255,255,255,0.1)" h={1} my="$1" />

            <Row
              label="scroll ≥85%"
              value={hasScrolledThreshold ? "✓ yes" : "✗ no"}
              valueColor={hasScrolledThreshold ? "#4ade80" : "#f87171"}
            />
            <Row
              label="rapid scroll"
              value={inRapidScroll ? "⚠ yes" : "✓ no"}
              valueColor={inRapidScroll ? "#f87171" : "#4ade80"}
            />
            <Row
              label="tracking"
              value={isTracking ? "● active" : "○ paused"}
              valueColor={isTracking ? "#4ade80" : "#facc15"}
            />
          </YStack>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  toggleButton: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 6,
    borderWidth: 1,
    bottom: 90,
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: "absolute",
    right: 12,
    zIndex: 9999,
  },
  dot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  panel: {
    backgroundColor: "rgba(10,10,10,0.88)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    // bottom: 130,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: "absolute",
    left: 12,
    bottom: 0,
    width: 210,
    zIndex: 9998,
  },
  progressFill: {
    borderRadius: 3,
    height: "100%",
  },
});
