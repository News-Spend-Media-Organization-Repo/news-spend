import { useFocusEffect } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackHeaderProps,
} from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns/format";
import { Suspense, useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useSnapshot } from "valtio";

import { NavigatorErrorBoundary } from "#/components/ErrorBoundaries/NavigatorErrorBoundary";
import { Icon } from "#/components/heroui/icon";
import { BellIcon, MagnifyingGlassIcon } from "#/lib/icons";
import { orpc } from "#/lib/orpc";
import NewsHome from "#/screens/tabs/home/NewsHome";
import NotificationsInbox from "#/screens/tabs/home/notifications/NotificationsInbox";
import SearchScreen from "#/screens/tabs/home/search/SearchScreen";
import { authState } from "#/state/auth";
import { useInboxSeen } from "#/state/inbox-seen";

const Header = ({ navigation }: NativeStackHeaderProps) => {
  const userId = useSnapshot(authState).user?.id ?? null;
  const { lastSeenAt, ready } = useInboxSeen(userId);
  const badgeEnabled = Boolean(userId) && ready;

  const { data: unreadCount = 0, refetch } = useQuery({
    ...orpc.notifications.inbox.unreadCount.queryOptions({
      input: { since: lastSeenAt },
    }),
    enabled: badgeEnabled,
  });

  useFocusEffect(
    useCallback(() => {
      if (badgeEnabled) {
        refetch();
      }
    }, [refetch, badgeEnabled])
  );

  return (
    <View className="flex-row items-center justify-between bg-p-500 px-2 pt-safe pb-2">
      <View>
        <Text className="font-bold text-background text-base uppercase">
          News Spend Media
        </Text>
        <Text className="text-white/60 text-xs">
          {format(new Date(), "EEEE, d MMMM")}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Pressable
          accessibilityLabel="Search"
          accessibilityRole="button"
          className="size-[38px] items-center justify-center rounded-full bg-white/10"
          hitSlop={8}
          onPress={() => navigation.navigate("Search")}
        >
          <Icon color="#fff" name={MagnifyingGlassIcon} size={20} />
        </Pressable>
        <Pressable
          accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          accessibilityRole="button"
          className="relative size-[38px] items-center justify-center rounded-full bg-white/10"
          hitSlop={8}
          onPress={() => navigation.navigate("NotificationsInbox")}
        >
          <Icon color="#fff" name={BellIcon} size={20} />
          {unreadCount > 0 ? (
            <View className="absolute -top-1 -right-1 size-4 items-center justify-center rounded-full border-2 border-p-500 bg-orange-500">
              <Text className="font-bold text-[9px] text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
};

export default createNativeStackNavigator({
  layout: ({ children }) => (
    <NavigatorErrorBoundary>{children}</NavigatorErrorBoundary>
  ),
  screenLayout: ({ children }) => (
    <Suspense fallback={<View style={{ flex: 1 }} />}>{children}</Suspense>
  ),
  screens: {
    NewsHome: {
      screen: NewsHome,
      linking: {
        path: "news",
      },
      options: {
        headerShown: true,
        animation: "slide_from_right",
        header: Header,
        // The header is always navy, so the bar is always light. Leaving it to
        // `auto` made it follow whichever `Screen` last mounted — dark icons on
        // a dark bar after a light screen.
        statusBarStyle: "light",
      },
    },
    Search: {
      screen: SearchScreen,
      linking: {
        path: "search",
      },
      options: {
        headerShown: false,
        animation: "fade",
      },
    },
    NotificationsInbox: {
      screen: NotificationsInbox,
      linking: {
        path: "notifications",
      },
      options: {
        headerShown: false,
        animation: "slide_from_right",
      },
    },
  },
  screenOptions: {
    headerShown: false,
    animation: "slide_from_right",
  },
  initialRouteName: "NewsHome",
});
