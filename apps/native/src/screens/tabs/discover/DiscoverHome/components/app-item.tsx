import type { PartnerContent } from "@news-spend-media/payload/types";
import { Image } from "expo-image";
import { cn, PressableFeedback } from "heroui-native";
import { ActivityIndicator, View } from "react-native";
import { Text } from "#/components/heroui/text";
import { getImageData } from "#/utils/getImageData";

type AppItemProps = {
  item: PartnerContent;
  onPress: () => void;
  loading?: boolean;
};

export function AppItem({ item, onPress, loading }: AppItemProps) {
  const { blurhash, url } = getImageData(item.media);

  return (
    <PressableFeedback onPress={onPress}>
      <PressableFeedback.Scale>
        <View className={cn("flex-row items-start gap-2.5 px-3 py-2", loading && "opacity-70")}>
          <Image
            className="rounded-lg"
            height={80}
            placeholder={{ blurhash }}
            source={{ uri: url ?? "" }}
            width={80}
          />
          <View className="flex-1 h-full justify-between">
            <View>
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 text-base" numberOfLines={2}>
                  {item.title}
                </Text>
                {loading ? <ActivityIndicator color="#666" size="small" /> : null}
              </View>
              <Text className="text-sm text-gray-50" numberOfLines={2}>
                {item.condition}
              </Text>
            </View>
            <View className="flex-row self-end rounded-full bg-s-300 px-2 py-1">
              <Text className="text-xs text-white">{item.points} points</Text>
            </View>
          </View>
        </View>
      </PressableFeedback.Scale>
      <PressableFeedback.Ripple />
    </PressableFeedback>
  );
}
