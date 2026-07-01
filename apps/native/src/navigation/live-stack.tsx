import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text, View } from "react-native";

import { NavigatorErrorBoundary } from "#/components/ErrorBoundaries/NavigatorErrorBoundary";
import LiveHome from "#/screens/tabs/live/LiveHome";

import { sharedScreens } from "./shared-screens";

export default createNativeStackNavigator({
  layout: ({ children }) => (
    <NavigatorErrorBoundary>{children}</NavigatorErrorBoundary>
  ),
  screens: {
    LiveHome: {
      screen: LiveHome,
      linking: {
        path: "live",
      },
      options: {
        headerShown: true,
        animation: "slide_from_right",
        header() {
          return (
            <View className="flex-row items-center justify-between bg-p-500 px-2 pt-safe pb-2">
              <Text className="font-bold text-background text-base uppercase">
                News Spend Media
              </Text>
            </View>
          );
        },
      },
    },
    ...sharedScreens,
  },
  screenOptions: {
    headerShown: false,
    animation: "slide_from_right",
  },
  initialRouteName: "LiveHome",
});
