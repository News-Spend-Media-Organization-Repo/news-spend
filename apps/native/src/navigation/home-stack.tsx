import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text, View } from "react-native";

import { NavigatorErrorBoundary } from "#/components/ErrorBoundaries/NavigatorErrorBoundary";
import NewsHome from "#/screens/tabs/home/NewsHome";

import { sharedScreens } from "./shared-screens";

const Header = () => (
  <View className="flex-row items-center justify-between bg-p-500 px-3 pt-safe">
    <Text className="font-bold text-2xl text-background uppercase">News Spend Media</Text>
  </View>
);

export default createNativeStackNavigator({
  layout: ({ children }) => <NavigatorErrorBoundary>{children}</NavigatorErrorBoundary>,
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
    ...sharedScreens,
  },
  screenOptions: {
    headerShown: false,
    animation: "slide_from_right",
  },
  initialRouteName: "NewsHome",
});
