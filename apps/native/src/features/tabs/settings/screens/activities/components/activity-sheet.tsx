import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { Activity } from "@news-spend-media/payload/types";
import { useNavigation } from "@react-navigation/core";
import { format } from "date-fns";
import { Image } from "expo-image";
import { BottomSheet, cn, PressableFeedback, Tabs } from "heroui-native";
import { NewspaperIcon } from "phosphor-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { getImageData } from "#/utils";
import { getActionMeta } from "../constants";

type ActivitySheetProps = {
  activity: Activity | null;
  isOpen: boolean;
  onOpenChange: (val: boolean) => void;
};

export function ActivitySheet({ activity, isOpen, onOpenChange }: ActivitySheetProps) {
  const [activeTab, setActiveTab] = useState("details");
  const navigation = useNavigation();

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setActiveTab("details");
    }
    onOpenChange(open);
  };

  if (!activity) {
    return null;
  }

  const meta = getActionMeta(activity.action);
  const isPositive = activity.point >= 0;

  const news = typeof activity.news === "object" ? activity.news : null;
  const { url, blurhash } = getImageData(news?.image);

  const onNewsPress = () => {
    if (!news) {
      return;
    }
    if (news?.type === "article") {
      navigation.navigate("News", {
        slug: news.slug,
        id: news.id,
      });
    } else {
      navigation.navigate("SingleLive", {
        slug: news.slug,
        id: news.id,
      });
    }

    handleOpenChange(false);
  };
  // Infer status from action type and point sign
  // let status: "reversal" | "pending" | "confirmed";
  // if (activity.action === "pointReversal") {
  //   status = "reversal";
  // } else if (activity.point === 0) {
  //   status = "pending";
  // } else {
  //   status = "confirmed";
  // }

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={handleOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          contentContainerClassName="h-full"
          enableDynamicSizing={false}
          enableOverDrag={false}
          snapPoints={["55%", "85%"]}
        >
          <BottomSheetScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          >
            {/* Header */}
            <View className="mb-4 flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View
                  className="h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: meta.bg }}
                >
                  <Icon color="#000" name={meta.icon} size={24} />
                </View>
                <View>
                  <BottomSheet.Title className="font-semibold text-base">
                    {meta.label}
                  </BottomSheet.Title>
                  <Text className="text-secondary text-xs capitalize">
                    {activity.type ?? "point"} · {format(new Date(activity.createdAt), "hh:mm a")}
                  </Text>
                </View>
              </View>

              {/* Status badge */}
              {/*<View
                className={cn(
                  "rounded-full px-3 py-1",
                  status === "confirmed" && "bg-success-50",
                  status === "pending" && "bg-warning-50",
                  status === "reversal" && "bg-danger-50",
                )}
              >
                <Text
                  className={cn(
                    "font-semibold text-xs",
                    status === "confirmed" && "text-success",
                    status === "pending" && "text-warning",
                    status === "reversal" && "text-danger",
                  )}
                >
                  {status === "confirmed"
                    ? "✓ Confirmed"
                    : status === "pending"
                      ? "⏳ Pending"
                      : "↩ Reversed"}
                </Text>
              </View>*/}
            </View>

            {/* Points hero */}
            <View
              className={cn(
                "mb-4 flex-row items-center gap-3 rounded-2xl px-4 py-3",
                isPositive ? "bg-success-50" : "bg-danger-50",
              )}
            >
              <Text
                className={cn(
                  "font-bold text-3xl tracking-tight",
                  isPositive ? "text-success-800" : "text-danger-800",
                )}
              >
                {isPositive ? "+" : ""}
                {activity.point}
              </Text>
              <Text
                className={cn(
                  "font-medium text-sm",
                  isPositive ? "text-success-600" : "text-danger-600",
                )}
              >
                points {isPositive ? "earned" : "spent"}
              </Text>
            </View>

            {/* Tabs */}
            <Tabs className="mb-4" onValueChange={setActiveTab} value={activeTab}>
              <Tabs.List>
                <Tabs.ScrollView>
                  <Tabs.Indicator />
                  <Tabs.Trigger value="details">
                    <Tabs.Label>Details</Tabs.Label>
                  </Tabs.Trigger>
                  {activity.news && (
                    <Tabs.Trigger value="linked">
                      <Tabs.Label>Linked content</Tabs.Label>
                    </Tabs.Trigger>
                  )}
                  {activity.metadata && (
                    <Tabs.Trigger value="meta">
                      <Tabs.Label>Metadata</Tabs.Label>
                    </Tabs.Trigger>
                  )}
                </Tabs.ScrollView>
              </Tabs.List>

              {/* Details tab */}
              <Tabs.Content value="details">
                <View className="gap-3 pt-3">
                  <View className="flex-row gap-2">
                    <View className="flex-1 rounded-xl bg-surface p-3">
                      <Text className="mb-1 font-semibold text-secondary text-xs uppercase">
                        Action
                      </Text>
                      <Text className="font-medium text-sm">{meta.label}</Text>
                    </View>
                    <View className="flex-1 rounded-xl bg-surface p-3">
                      <Text className="mb-1 font-semibold text-secondary text-xs uppercase">
                        Type
                      </Text>
                      <Text className="font-medium text-sm capitalize">
                        {activity.type ?? "point"}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-2">
                    <View className="flex-1 rounded-xl bg-surface p-3">
                      <Text className="mb-1 font-semibold text-secondary text-xs uppercase">
                        Date
                      </Text>
                      <Text className="font-medium text-sm">
                        {format(new Date(activity.createdAt), "dd/MM/yyyy")}
                      </Text>
                    </View>
                    <View className="flex-1 rounded-xl bg-surface p-3">
                      <Text className="mb-1 font-semibold text-secondary text-xs uppercase">
                        Time
                      </Text>
                      <Text className="font-medium text-sm">
                        {format(new Date(activity.createdAt), "hh:mm a")}
                      </Text>
                    </View>
                  </View>

                  <View className="rounded-xl bg-surface p-3">
                    <Text className="mb-1 font-semibold text-secondary text-xs uppercase">
                      Activity ID
                    </Text>
                    <Text className="font-mono text-secondary text-xs" numberOfLines={1}>
                      {activity.id}
                    </Text>
                  </View>

                  {activity.description && (
                    <View className="rounded-xl bg-surface p-3">
                      <Text className="mb-1 font-semibold text-secondary text-xs uppercase">
                        Description
                      </Text>
                      <Text className="text-secondary text-sm leading-5">
                        {activity.description}
                      </Text>
                    </View>
                  )}

                  {activity.reward && (
                    <View className="rounded-xl bg-surface p-3">
                      <Text className="mb-1 font-semibold text-secondary text-xs uppercase">
                        Reward
                      </Text>
                      <Text className="font-medium text-sm">{activity.reward}</Text>
                    </View>
                  )}
                </View>
              </Tabs.Content>

              {/* Linked content tab */}
              {news && (
                <Tabs.Content value="linked">
                  <View className="gap-3 pt-3">
                    <View className="flex-row items-center gap-3 rounded-xl bg-surface p-3">
                      <View className="size-14 items-center justify-center overflow-hidden rounded-xl bg-p-100">
                        {news?.image ? (
                          <Image
                            contentFit="cover"
                            placeholder={{ blurhash }}
                            placeholderContentFit="cover"
                            source={url}
                            style={{ height: "100%", width: "100%" }}
                          />
                        ) : (
                          <Icon color="white" name={NewspaperIcon} size={24} />
                        )}
                      </View>
                      <PressableFeedback className="flex-1" onPress={onNewsPress}>
                        <Text className="font-medium text-sm leading-5" numberOfLines={3}>
                          {news?.title ?? "News article"}
                        </Text>
                        <Text className="mt-1 text-secondary text-xs">Tap to open article</Text>
                      </PressableFeedback>
                    </View>
                  </View>
                </Tabs.Content>
              )}

              {/* Metadata tab */}
              {activity.metadata && (
                <Tabs.Content value="meta">
                  <View className="gap-2 pt-3">
                    {Object.entries(activity.metadata as Record<string, unknown>).map(
                      ([key, value]) => (
                        <View className="rounded-xl bg-surface p-3" key={key}>
                          <Text className="mb-1 font-semibold text-secondary text-xs uppercase">
                            {key}
                          </Text>
                          <Text className="font-mono text-secondary text-xs">{String(value)}</Text>
                        </View>
                      ),
                    )}
                  </View>
                </Tabs.Content>
              )}
            </Tabs>
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
