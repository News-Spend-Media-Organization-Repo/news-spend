import { formatDistanceToNowStrict } from "date-fns/formatDistanceToNowStrict";
import { cn } from "heroui-native/utils";
import { Pressable, View } from "react-native";
import { Icon } from "#/components/heroui/icon";
import { Image } from "#/components/heroui/image";
import { Text } from "#/components/heroui/text";
import {
  BellIcon,
  ChatIcon,
  GiftIcon,
  LightningIcon,
  NewspaperIcon,
} from "#/lib/icons";

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  data?: Record<string, unknown> | null;
  type?: string | null;
  createdAt: string;
};

type TypeStyle = {
  icon: typeof BellIcon;
  color: string;
  background: string;
};

function typeStyle(type: InboxItem["type"]): TypeStyle {
  switch (type) {
    case "breaking_news":
      return {
        icon: LightningIcon,
        color: "#DC2626",
        background: "bg-red-100",
      };
    case "news":
      return {
        icon: NewspaperIcon,
        color: "#00223D",
        background: "bg-p-500/10",
      };
    case "comment":
      return {
        icon: ChatIcon,
        color: "#16A34A",
        background: "bg-green-100",
      };
    case "promo":
      return {
        icon: GiftIcon,
        color: "#EA580C",
        background: "bg-orange-100",
      };
    default:
      return {
        icon: BellIcon,
        color: "#6B7280",
        background: "bg-gray-100",
      };
  }
}

type NotificationRowProps = {
  item: InboxItem;
  unread: boolean;
  onPress: () => void;
};

export function NotificationRow({
  item,
  unread,
  onPress,
}: NotificationRowProps) {
  const style = typeStyle(item.type);

  return (
    <Pressable
      accessibilityLabel={`${item.title}${unread ? ", unread" : ""}`}
      accessibilityRole="button"
      className={cn(
        "flex-row gap-3 border-gray-100 border-b px-4 py-3",
        unread && "bg-p-50"
      )}
      onPress={onPress}
    >
      <View
        className={cn(
          "mt-0.5 size-10 items-center justify-center rounded-full",
          style.background
        )}
      >
        <Icon color={style.color} name={style.icon} size={20} />
      </View>

      <View className="flex-1 gap-0.5">
        <View className="flex-row items-start gap-1.5">
          {unread ? (
            <View
              accessibilityLabel="Unread"
              accessible
              className="mt-1.5 size-2 rounded-full bg-orange-500"
            />
          ) : null}
          <Text
            className={cn(
              "flex-1 text-base",
              unread ? "font-bold" : "font-semibold"
            )}
            numberOfLines={2}
          >
            {item.title}
          </Text>
        </View>

        <Text className="text-gray-600 text-sm" numberOfLines={2}>
          {item.body}
        </Text>

        <Text className="text-gray-500 text-xs">
          {formatDistanceToNowStrict(new Date(item.createdAt), {
            addSuffix: true,
          })}
        </Text>
      </View>

      {item.imageUrl ? (
        <Image
          className="size-14 rounded-lg"
          contentFit="cover"
          source={{ uri: item.imageUrl }}
        />
      ) : null}
    </Pressable>
  );
}
