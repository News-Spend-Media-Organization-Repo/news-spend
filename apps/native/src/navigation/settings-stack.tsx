import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Suspense } from "react";
import { View } from "react-native";
import { NavigatorErrorBoundary } from "#/components/ErrorBoundaries/NavigatorErrorBoundary";
import ScreenHeader from "#/components/ScreenHeader";
import SettingsHome from "#/features/tabs/settings/screens/SettingsHome";
import { detailScreenHeader } from "./shared-screens";

export default createNativeStackNavigator({
  layout: ({ children, state, descriptors, navigation }) => (
    <NavigatorErrorBoundary>{children}</NavigatorErrorBoundary>
  ),
  screenLayout: ({ children }) => (
    <Suspense fallback={<View style={{ flex: 1 }} />}>{children}</Suspense>
  ),
  screens: {
    SettingsHome: {
      screen: SettingsHome,
      linking: {
        path: "settings",
      },
      options: {
        headerShown: true,
        header() {
          // Pushed from the More sheet, so it needs the back arrow a tab
          // root never had.
          return <ScreenHeader title="Me" />;
        },
        animation: "slide_from_right",
      },
    },
  },
  screenOptions: {
    headerShown: true,
    header: detailScreenHeader,
    animation: "slide_from_right",
  },
  initialRouteName: "SettingsHome",
});
