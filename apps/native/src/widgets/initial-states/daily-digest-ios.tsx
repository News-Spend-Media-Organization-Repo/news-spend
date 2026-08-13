import { Voltra as V } from "@use-voltra/ios/server";

/**
 * Build-time placeholder for the daily digest widget.
 *
 * Rendered by the Voltra config plugin during prebuild and baked into
 * VoltraWidgetInitialStates.swift, where it backs `Provider.placeholder` and the
 * widget gallery preview — everything shown before the first real timeline entry
 * or server fetch lands.
 *
 * Deliberately carries no date, greeting or headline: this snapshot is frozen at
 * build time, so any real content here would ship stale and still be on screen
 * months later. Chrome plus muted skeleton rows only.
 */

const ACCENT = "#4A90D9";
const MUTED = "#999999";
const SKELETON = "#24354A";
const SURFACE = "#0E1B2A";

function SkeletonLine({ width }: { width: number }) {
  return (
    <V.View
      style={{
        width,
        height: 10,
        borderRadius: 5,
        backgroundColor: SKELETON,
      }}
    />
  );
}

export default {
  systemSmall: (
    <V.ZStack style={{ flex: 1, backgroundColor: SURFACE }}>
    <V.VStack spacing={8} style={{ padding: 16 }}>
      <V.Text style={{ fontSize: 11, fontWeight: "600", color: ACCENT }}>
        DAILY DIGEST
      </V.Text>
      <V.VStack spacing={6} style={{ marginTop: 4 }}>
        <SkeletonLine width={110} />
        <SkeletonLine width={86} />
      </V.VStack>
    </V.VStack>
    </V.ZStack>
  ),
  systemMedium: (
    <V.ZStack style={{ flex: 1, backgroundColor: SURFACE }}>
    <V.VStack spacing={12} style={{ padding: 16 }}>
      <V.HStack style={{ alignItems: "center" }}>
        <V.Text style={{ fontSize: 11, fontWeight: "600", color: ACCENT }}>
          DAILY DIGEST
        </V.Text>
        <V.Spacer />
        <V.Text style={{ fontSize: 11, color: MUTED }}>NEWS SPEND</V.Text>
      </V.HStack>
      <V.VStack spacing={10}>
        <SkeletonLine width={240} />
        <SkeletonLine width={196} />
        <V.Divider style={{ marginTop: 2 }} />
        <SkeletonLine width={228} />
      </V.VStack>
    </V.VStack>
    </V.ZStack>
  ),
};
