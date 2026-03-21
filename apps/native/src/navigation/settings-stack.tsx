import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { X } from "@tamagui/lucide-icons";

import { NavigatorErrorBoundary } from "#/components/ErrorBoundaries/NavigatorErrorBoundary";
import ScreenHeader from "#/components/ScreenHeader";
import SettingsHome from "#/features/tabs/settings/screens/SettingsHome";

import { sharedScreens } from "./shared-screens";

const ROUTE_TITLES = {
  Report: "IWitness Report",
  Notification: "Notification Manager",
  DataManager: "Data Manager",
  DeleteAccount: "Delete Account",
  Support: "Contact Us",
  FAQ: "Frequently Asked Questions",
  Advertise: "Advertising",
  Call: "Call Us",
  Email: "Email Customer Support",
  Feedback: "Send Feedback",
  Legal: "Legal Agreement",
  TermsOfUse: "Terms of Use",
  PrivacyPolicy: "Privacy Policy",
  RateApp: "Rate App",
  ShareApp: "Share App",
  Socials: "Follow Us",
  VerifyIdentity: "Verify Identity",
} as const;

type RouteNames = keyof typeof ROUTE_TITLES;

function getRouteTitle(routeName: string): string {
  return ROUTE_TITLES[routeName as RouteNames] ?? routeName;
}
export default createNativeStackNavigator({
  layout: ({ children, state, descriptors, navigation }) => (
    <NavigatorErrorBoundary>{children}</NavigatorErrorBoundary>
  ),
  screens: {
    SettingsHome: {
      screen: SettingsHome,
      linking: {
        path: "settings",
      },
      options: {
        headerShown: true,
        header({ navigation }) {
          return (
            <ScreenHeader
              left={null}
              right={
                <X color="$background" onPress={() => navigation.goBack()} />
              }
              title="Settings"
            />
          );
        },
        animation: "slide_from_right",
      },
    },
    ...sharedScreens,
  },
  screenOptions: {
    headerShown: true,
    header({ route }) {
      const title = getRouteTitle(route.name);

      return <ScreenHeader title={title} />;
    },
    animation: "slide_from_right",
  },
  initialRouteName: "SettingsHome",
});
