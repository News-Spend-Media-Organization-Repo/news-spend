import { useNavigation } from "@react-navigation/native";
import { PressableFeedback } from "heroui-native";
import { ArrowLeftIcon } from "phosphor-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { Icon } from "./heroui/icon";
import { Text } from "./heroui/text";

type ScreenHeaderProps = {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
};

const ScreenHeader = ({ title, left, right }: ScreenHeaderProps) => {
  const navigation = useNavigation();

  console.log(title);

  return (
    <View className="relative w-full flex-row items-center justify-center bg-p-500 px-3 py-2 pt-safe-offset-1">
      {/* Left Item */}
      <PressableFeedback
        className="min-w-10 items-center justify-center px-2"
        hitSlop={8}
        onPress={() => navigation.goBack()}
      >
        {left === undefined ? <Icon color="white" name={ArrowLeftIcon} size={24} /> : left}
      </PressableFeedback>
      {/* Title */}
      <View className="flex-1 items-center justify-center">
        <Text className="font-medium text-lg text-white capitalize">{title}</Text>
      </View>
      {/* Right Item */}
      <View className="min-w-10 items-center justify-center px-2">{right}</View>
    </View>
  );
};

export default ScreenHeader;
