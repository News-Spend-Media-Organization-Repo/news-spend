import { Image } from "#/components/heroui/image";
import { PressableFeedback } from "heroui-native/pressable-feedback";
import { View } from "react-native";
import { Text } from "#/components/heroui/text";

type GameItemData = {
  id: string;
  title?: string;
  description?: string;
  image?: string;
  url?: string;
};

type GameItemProps = {
  item: GameItemData;
  onPress: () => void;
};

export function GameItem({ item, onPress }: GameItemProps) {
  return (
    <PressableFeedback onPress={onPress}>
      <PressableFeedback.Scale>
        <View className="flex-row items-start gap-2.5 px-3 py-2">
          <Image className="rounded-lg" height={80} source={{ uri: item.image }} width={80} />
          <View className="flex-1 gap-2">
            <Text className="text-base font-semibold" numberOfLines={2}>
              {item.title}
            </Text>
            <Text className="text-sm text-gray-50" numberOfLines={2}>
              {item.description}
            </Text>
          </View>
        </View>
      </PressableFeedback.Scale>
      <PressableFeedback.Ripple />
    </PressableFeedback>
  );
}
