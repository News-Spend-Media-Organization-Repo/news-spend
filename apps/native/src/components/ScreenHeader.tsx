import { PressableFeedback } from "heroui-native/pressable-feedback";
import { cn } from "heroui-native/utils";
import type { ReactNode } from "react";
import { View } from "react-native";
import { ArrowLeftIcon } from "#/lib/icons";
import { useSafeBack } from "#/navigation/useSafeBack";
import { Icon } from "./heroui/icon";
import { Text } from "./heroui/text";

type ScreenHeaderProps = {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
};

const ScreenHeader = ({ title, left, right, className }: ScreenHeaderProps) => {
  const goBack = useSafeBack();

  return (
    <View
      className={cn(
        "relative w-full flex-row items-center justify-center bg-p-500 px-3 py-2 pt-safe-offset-1",
        className
      )}
    >
      {/* Left Item */}
      <PressableFeedback
        className="min-w-10 items-center justify-center px-2"
        hitSlop={20}
        onPress={goBack}
      >
        {left === undefined ? (
          <Icon color="white" name={ArrowLeftIcon} size={24} />
        ) : (
          left
        )}
      </PressableFeedback>
      {/* Title */}
      <View className="flex-1 items-center justify-center">
        {/* One line, always. The title is sometimes a name the app does not
            control — a giveaway, an article — and without this a long one wraps
            and grows the bar, pushing the screen down with it. */}
        <Text
          className="font-medium text-base text-white capitalize"
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
      {/* Right Item */}
      <View className="min-w-10 items-center justify-center px-2">{right}</View>
    </View>
  );
};

export default ScreenHeader;
