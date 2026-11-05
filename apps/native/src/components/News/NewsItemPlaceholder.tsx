import { SkeletonGroup } from "heroui-native/skeleton-group";
import { View } from "react-native";
import { FadeOut } from "react-native-reanimated";

/**
 * A skeleton removed while results render would otherwise keep fading out
 * on top of them (the default exit is FadeOut), so a screen that swaps the
 * skeleton for content in place can turn the exit off.
 */
const INSTANT_EXIT = { exiting: { value: FadeOut.duration(0) } } as const;

export default function NewsItemPlaceholder({
  show,
  latest,
  instantExit = false,
}: {
  show: boolean;
  latest?: boolean;
  instantExit?: boolean;
}) {
  return (
    <SkeletonGroup
      animation={instantExit ? INSTANT_EXIT : undefined}
      isLoading={show}
    >
      <View className="gap-2.5">
        <View className="flex-row gap-4">
          <SkeletonGroup.Item className="size-[100px] rounded-[10px]" />
          <View
            className={`flex-1 ${latest ? "justify-between" : "justify-center gap-4"}`}
          >
            {latest && (
              <SkeletonGroup.Item className="h-5 w-[100px] rounded-sm" />
            )}
            <SkeletonGroup.Item className="h-10 w-full rounded-sm" />
            <SkeletonGroup.Item className="h-5 w-full rounded-sm" />
          </View>
        </View>
      </View>
    </SkeletonGroup>
  );
}
