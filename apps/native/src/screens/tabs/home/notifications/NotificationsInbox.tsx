import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { isSameDay } from "date-fns/isSameDay";
import { cn } from "heroui-native/utils";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { useSnapshot } from "valtio";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { CaretLeftIcon } from "#/lib/icons";
import { client, orpc } from "#/lib/orpc";
import { notificationDataTarget } from "#/navigation/linking";
import { useSafeBack } from "#/navigation/useSafeBack";
import { authState } from "#/state/auth";
import { useInboxSeen } from "#/state/inbox-seen";
import { type InboxItem, NotificationRow } from "./NotificationRow";

type InboxFilter = "all" | "news" | "replies";

const FILTERS: { label: string; value: InboxFilter }[] = [
  { label: "All", value: "all" },
  { label: "News", value: "news" },
  { label: "Replies", value: "replies" },
];

const PAGE_SIZE = 20;

type Row =
  | { kind: "heading"; id: string; label: string }
  | { kind: "notification"; id: string; item: InboxItem };

function InboxHeader({ onMarkAllRead }: { onMarkAllRead: () => void }) {
  const goBack = useSafeBack();

  return (
    <View className="flex-row items-center gap-2 bg-p-500 px-3 pt-safe pb-2">
      <Pressable
        accessibilityLabel="Go back"
        accessibilityRole="button"
        className="size-10 items-center justify-center"
        hitSlop={8}
        onPress={goBack}
      >
        <Icon color="#fff" name={CaretLeftIcon} size={24} />
      </Pressable>

      <Text className="flex-1 font-bold text-white text-xl">Notifications</Text>

      <Pressable
        accessibilityRole="button"
        className="min-h-10 justify-center"
        hitSlop={8}
        onPress={onMarkAllRead}
      >
        <Text className="font-semibold text-s-300 text-sm">Mark all read</Text>
      </Pressable>
    </View>
  );
}

function Filters({
  filter,
  onChange,
}: {
  filter: InboxFilter;
  onChange: (filter: InboxFilter) => void;
}) {
  return (
    <View className="flex-row gap-2 bg-white px-4 py-3">
      {FILTERS.map(({ label, value }) => {
        const selected = filter === value;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={cn(
              "rounded-full border px-3 py-1.5",
              selected ? "border-p-500 bg-p-500" : "border-gray-300 bg-white"
            )}
            key={value}
            onPress={() => onChange(value)}
          >
            <Text
              className={cn(
                "font-medium text-sm",
                selected ? "text-white" : "text-gray-600"
              )}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function NotificationsInbox() {
  const userId = useSnapshot(authState).user?.id ?? null;
  const { lastSeenAt, markSeen } = useInboxSeen(userId);
  const [filter, setFilter] = useState<InboxFilter>("all");

  const input = useCallback(
    (pageParam: number) => ({ filter, limit: PAGE_SIZE, page: pageParam }),
    [filter]
  );

  const {
    data,
    isPending,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    ...orpc.notifications.inbox.list.infiniteOptions({
      input,
      initialPageParam: 1,
      getNextPageParam: (lastPage) => lastPage?.nextPage,
      queryKey: [
        ...orpc.notifications.inbox.list.infiniteKey({
          input,
          initialPageParam: 1,
        }),
        { userId },
      ],
    }),
    enabled: Boolean(userId),
  });

  // Items stay highlighted while the reader is on this screen, then count as
  // seen once they leave.
  useFocusEffect(useCallback(() => () => markSeen(), [markSeen]));

  const isUnread = useCallback(
    (item: InboxItem) =>
      lastSeenAt !== null && new Date(item.createdAt) > new Date(lastSeenAt),
    [lastSeenAt]
  );

  const openItem = useCallback((item: InboxItem) => {
    client.notifications.inbox
      .markOpened({ id: item.id })
      .catch(() => undefined);

    const target = notificationDataTarget(item.data ?? undefined);
    if (target) {
      Linking.openURL(target).catch(() => undefined);
    }
  }, []);

  const rows = useMemo<Row[]>(() => {
    const items = (data?.pages.flatMap((page) => page.docs) ??
      []) as InboxItem[];
    const today: InboxItem[] = [];
    const earlier: InboxItem[] = [];
    const now = new Date();

    for (const item of items) {
      (isSameDay(new Date(item.createdAt), now) ? today : earlier).push(item);
    }

    return [
      ...(today.length
        ? [{ kind: "heading" as const, id: "today", label: "Today" }]
        : []),
      ...today.map((item) => ({
        kind: "notification" as const,
        id: item.id,
        item,
      })),
      ...(earlier.length
        ? [{ kind: "heading" as const, id: "earlier", label: "Earlier" }]
        : []),
      ...earlier.map((item) => ({
        kind: "notification" as const,
        id: item.id,
        item,
      })),
    ];
  }, [data]);

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<Row>) => {
      if (item.kind === "heading") {
        return (
          <Text className="bg-white px-4 pt-4 pb-2 font-bold text-gray-500 text-xs uppercase">
            {item.label}
          </Text>
        );
      }

      return (
        <NotificationRow
          item={item.item}
          onPress={() => openItem(item.item)}
          unread={isUnread(item.item)}
        />
      );
    },
    [isUnread, openItem]
  );

  const emptyList = useCallback(
    () => (
      <View className="flex-1 items-center justify-center px-6 py-16">
        <Text className="text-center text-base text-gray-500">
          No notifications yet
        </Text>
      </View>
    ),
    []
  );

  const footer = useCallback(
    () =>
      isFetchingNextPage ? (
        <View className="items-center py-4">
          <ActivityIndicator />
        </View>
      ) : null,
    [isFetchingNextPage]
  );

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <View className="flex-1 bg-white">
      <InboxHeader onMarkAllRead={markSeen} />

      {userId ? (
        <>
          <Filters filter={filter} onChange={setFilter} />
          {isPending ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : (
            <LegendList
              contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
              data={rows}
              keyExtractor={(row) => row.id}
              ListEmptyComponent={emptyList}
              ListFooterComponent={footer}
              onEndReached={onEndReached}
              onEndReachedThreshold={0.5}
              onRefresh={refetch}
              recycleItems
              refreshing={isRefetching}
              renderItem={renderItem}
              style={{ flex: 1 }}
            />
          )}
        </>
      ) : (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-base text-gray-600">
            Sign in to see your notifications
          </Text>
        </View>
      )}
    </View>
  );
}
