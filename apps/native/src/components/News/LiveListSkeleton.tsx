import { MotiView } from "@alloc/moti";
import { Skeleton } from "@alloc/moti/skeleton";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Separator, Stack, XStack } from "tamagui";

import VideoNewsItemPlaceholder from "#/components/videoNews/VideoNewsItemPlaceholder";

const colorMode = "light";
export default function LiveListSkeleton() {
  const { height } = useWindowDimensions();
  return (
    <MotiView
      animate={{ backgroundColor: "#ffffff" }}
      style={[styles.container]}
      transition={{
        type: "timing",
      }}
    >
      <Skeleton
        colorMode={colorMode}
        height={height * 0.33}
        radius={8}
        width="100%"
      />

      <Separator boc="transparent" borderWidth={8} />

      <Stack gap="$4">
        <Skeleton colorMode={colorMode} height={20} width={200} />

        <XStack gap={15}>
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton
              colorMode={colorMode}
              height={170}
              key={index}
              width={150}
            />
          ))}
        </XStack>
      </Stack>

      <Separator boc="transparent" borderWidth={8} />

      <Stack gap="$4">
        <Skeleton colorMode={colorMode} height={20} width={170} />

        <Stack gap="$2.5">
          {Array.from({ length: 3 }).map((_, index) => (
            <VideoNewsItemPlaceholder key={index} />
          ))}
        </Stack>
      </Stack>
      <Separator boc="transparent" borderWidth={8} />
    </MotiView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
});
