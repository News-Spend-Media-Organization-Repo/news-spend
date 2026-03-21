import { MotiView, ScrollView } from "@alloc/moti";
import { Skeleton } from "@alloc/moti/skeleton";
import { Dimensions, StyleSheet } from "react-native";
import { Separator, Stack, XStack } from "tamagui";

const colorMode = "light";

const { height, width } = Dimensions.get("window");
export default function HomeListSkeleton() {
  // const { height, width } = useWindowDimensions();
  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: 10,
        backgroundColor: "#ffffff",
      }}
      scrollEnabled={false}
    >
      <MotiView
        animate={{ backgroundColor: "#ffffff" }}
        style={styles.container}
        transition={{
          type: "timing",
        }}
      >
        <XStack gap="$3.5" px={15}>
          <Skeleton
            colorMode={colorMode}
            height={height * 0.33}
            radius={8}
            width={width * 0.88}
          />
          <Skeleton
            colorMode={colorMode}
            height={height * 0.33}
            radius={8}
            width={width * 0.88}
          />
        </XStack>

        <Separator boc="transparent" borderWidth={8} />

        <Stack gap="$4" px="$3">
          <Skeleton colorMode={colorMode} height={20} width={200} />

          <XStack gap={15}>
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                colorMode={colorMode}
                height={150}
                key={index}
                width={150}
              />
            ))}
          </XStack>
        </Stack>

        <Separator boc="transparent" borderWidth={8} />

        <Stack gap="$4" px="$3">
          <Skeleton colorMode={colorMode} height={20} width={200} />

          <XStack gap={15}>
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                colorMode={colorMode}
                height={170}
                key={index}
                width={120}
              />
            ))}
          </XStack>
        </Stack>

        <Separator boc="transparent" borderWidth={8} />

        <Stack gap="$true" px="$3">
          <Skeleton colorMode={colorMode} height={20} width={170} />

          <Stack gap="$2.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                colorMode={colorMode}
                height={120}
                key={index}
                width="100%"
              />
            ))}
          </Stack>
        </Stack>
      </MotiView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
});
