import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { H4, XStack } from "tamagui";

import { NavigatorErrorBoundary } from "#/components/ErrorBoundaries/NavigatorErrorBoundary";
import Discover from "#/screens/tabs/discover/DiscoverHome";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

import { sharedScreens } from "./shared-screens";

export default createNativeStackNavigator({
  layout: ({ children, state, descriptors, navigation }) => (
    <NavigatorErrorBoundary>{children}</NavigatorErrorBoundary>
  ),
  screens: {
    DiscoverHome: {
      screen: Discover,
      linking: {
        path: "discover",
      },
      options: {
        animation: "slide_from_right",
        headerShown: true,
        header() {
          const insets = useSafeAreaInsetsStyle(["top"]);
          return (
            <XStack
              ai="center"
              backgroundColor="$p500"
              jc="space-between"
              pt="$2"
              px="$3"
              style={insets}
            >
              <H4 color="$background" textTransform="uppercase">
                Points Mall
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
  initialRouteName: "DiscoverHome",
});
