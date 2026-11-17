import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Suspense } from "react";
import { View } from "react-native";
import { NavigatorErrorBoundary } from "#/components/ErrorBoundaries/NavigatorErrorBoundary";
import ScreenHeader from "#/components/ScreenHeader";
import ShopHome from "#/features/tabs/shop/screens/ShopHome";

/**
 * Shop is pushed from the More sheet now, not shown as a tab, so it takes the
 * shared navy header with its back arrow instead of a bare brand bar.
 */
function ShopHeader() {
  return <ScreenHeader title="Shop" />;
}

export default createNativeStackNavigator({
  layout: ({ children, state, descriptors, navigation }) => (
    <NavigatorErrorBoundary>{children}</NavigatorErrorBoundary>
  ),
  screenLayout: ({ children }) => (
    <Suspense fallback={<View style={{ flex: 1 }} />}>{children}</Suspense>
  ),
  screens: {
    ShopHome: {
      screen: ShopHome,
      linking: {
        path: "shop",
      },
      options: {
        headerShown: true,
        animation: "slide_from_right",
        header: ShopHeader,
        // Navy header, so the bar stays light (see home-stack).
        statusBarStyle: "light",
      },
    },
  },
  screenOptions: {
    headerShown: false,
    animation: "slide_from_right",
  },
  initialRouteName: "ShopHome",
});
