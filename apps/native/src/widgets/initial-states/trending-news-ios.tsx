import { Voltra as V } from "@use-voltra/ios/server";

/**
 * Build-time placeholder for the trending news widget. See the sibling
 * daily-digest file for why this carries chrome and skeleton rows only.
 */

const ACCENT = "#FF6B35";
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
        TRENDING
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
          TRENDING
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
