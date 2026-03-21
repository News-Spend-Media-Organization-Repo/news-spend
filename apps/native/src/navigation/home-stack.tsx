import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { H4, XStack } from "tamagui";

import { NavigatorErrorBoundary } from "#/components/ErrorBoundaries/NavigatorErrorBoundary";
import NewsHome from "#/screens/tabs/home/NewsHome";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

import { sharedScreens } from "./shared-screens";

const Header = () => {
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
};

export default createNativeStackNavigator({
  layout: ({ children, state, descriptors, navigation }) => (
    <NavigatorErrorBoundary>{children}</NavigatorErrorBoundary>
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
    ...sharedScreens,
  },
  screenOptions: {
    headerShown: false,
    animation: "slide_from_right",
  },
  initialRouteName: "NewsHome",
});
