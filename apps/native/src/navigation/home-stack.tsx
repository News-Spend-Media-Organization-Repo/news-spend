import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { format } from "date-fns/format";
import { Suspense } from "react";
import { Pressable, Text, View } from "react-native";

import { NavigatorErrorBoundary } from "#/components/ErrorBoundaries/NavigatorErrorBoundary";
import { Icon } from "#/components/heroui/icon";
import { BellIcon, MagnifyingGlassIcon } from "#/lib/icons";
import NewsHome from "#/screens/tabs/home/NewsHome";

const noop = () => {
  // TODO(phase2/3): open the search and notifications screens.
};

const Header = () => (
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
        onPress={noop}
      >
        <Icon color="#fff" name={MagnifyingGlassIcon} size={20} />
      </Pressable>
      <Pressable
        accessibilityLabel="Notifications"
        accessibilityRole="button"
        className="size-[38px] items-center justify-center rounded-full bg-white/10"
        hitSlop={8}
        onPress={noop}
      >
        <Icon color="#fff" name={BellIcon} size={20} />
      </Pressable>
    </View>
  </View>
);

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
      },
    },
  },
  screenOptions: {
    headerShown: false,
    animation: "slide_from_right",
  },
  initialRouteName: "NewsHome",
});
