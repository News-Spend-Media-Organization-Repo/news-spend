import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { H4, XStack } from "tamagui";

import { NavigatorErrorBoundary } from "#/components/ErrorBoundaries/NavigatorErrorBoundary";
import LiveHome from "#/screens/tabs/live/LiveHome";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

import { sharedScreens } from "./shared-screens";

export default createNativeStackNavigator({
  layout: ({ children, state, descriptors, navigation }) => (
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
          const insets = useSafeAreaInsetsStyle(["top"]);
          return (
            <XStack
              ai="center"
              backgroundColor="$p500"
              jc="space-between"
              px="$3"
              py="$2"
              style={insets}
            >
              <H4 color="$background" textTransform="uppercase">
                News Spend Media
              </H4>
            </XStack>
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
