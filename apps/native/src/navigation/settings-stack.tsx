import {
  createNativeStackNavigator,
  type NativeStackHeaderProps,
} from "@react-navigation/native-stack";
import { Suspense } from "react";
import { View } from "react-native";
import { NavigatorErrorBoundary } from "#/components/ErrorBoundaries/NavigatorErrorBoundary";
import ScreenHeader from "#/components/ScreenHeader";
import SettingsHome from "#/features/tabs/settings/screens/SettingsHome";

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
  IdentityVerification: "Verify Identity",
  CommunityGuidelines: "Community Guidelines",
  BlockedUsers: "Blocked Users",
  Profile: "Profile",
  Activities: "Activities",
} as const;

type RouteNames = keyof typeof ROUTE_TITLES;

function getRouteTitle(routeName: string): string {
  return ROUTE_TITLES[routeName as RouteNames] ?? routeName;
}

const screenHeader = ({ route }: NativeStackHeaderProps) => {
  const title = getRouteTitle(route.name);

  return <ScreenHeader title={title} />;
};

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
          return <ScreenHeader left={null} title="Me" />;
        },
        animation: "slide_from_right",
      },
    },
  },
  screenOptions: {
    headerShown: true,
    header: screenHeader,
    animation: "slide_from_right",
  },
  initialRouteName: "SettingsHome",
});
