import { createStaticNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Platform } from "react-native";
import { useSnapshot } from "valtio";

import { MoreSheet } from "#/features/tabs/more/MoreSheet";
import { authState } from "#/state/auth";
import { useNeedsOnboarding } from "#/state/onboarding";

import { commonAuthScreens, onboardingScreens } from "./common";
import SettingsStack from "./settings-stack";
import { sharedScreens } from "./shared-screens";
import ShopStack from "./shop-stack";
import TabLayout from "./tab-navigator";
import { TAB_PATHS } from "./tab-paths";

function useIsSignedIn() {
  const { status } = useSnapshot(authState);
  return status === "signIn";
}

function useIsSignedOut() {
  const { status } = useSnapshot(authState);
  return status === "signOut";
}

/**
 * Onboarding only for signed-out users who have never finished it. The flag is
 * reactive, so finishing onboarding closes the gate for the rest of the session
 * — signing out afterwards lands on Welcome, not back in the carousel.
 */
function useRootOnboardingGate() {
  return useNeedsOnboarding(useIsSignedOut());
}

const RootStackNavigator = createNativeStackNavigator({
  screenOptions: {
    headerShown: false,
    animation: "slide_from_right",
    // On iOS the status bar is read from this stack's top route only (the
    // lookup does not enter the native tab bar or nested stacks), and every
    // header in the app is navy, so default to light icons. A screen that
    // needs a different style publishes it here via the shared `Screen`
    // component. Android keeps expo-status-bar.
    ...(Platform.OS === "ios" ? { statusBarStyle: "light" as const } : {}),
  },
  groups: {
    // First group, so it wins the initial route when its condition holds.
    Onboarding: {
      if: useRootOnboardingGate,
      screens: onboardingScreens,
    },
    LoggedIn: {
      if: useIsSignedIn,
      screens: {
        Tab: TabLayout,
        // Five tabs is the native ceiling, so Shop and Me are pushed from the
        // More sheet rather than sharing the bar with it.
        Shop: {
          screen: ShopStack,
          linking: { path: TAB_PATHS.Shop, initialRouteName: "ShopHome" },
        },
        Me: {
          screen: SettingsStack,
          linking: { path: TAB_PATHS.Me, initialRouteName: "SettingsHome" },
        },
        // Opened by the More tab's press. A native sheet sized to its rows,
        // so it reads the same on iOS and Android and the hardware back
        // button closes it like any other route.
        MoreSheet: {
          screen: MoreSheet,
          linking: { path: "more" },
          options: {
            presentation: "formSheet",
            sheetAllowedDetents: "fitToContents",
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          },
        },
        ...sharedScreens,
        ...commonAuthScreens,
      },
    },
    LoggedOut: {
      if: useIsSignedOut,
      screens: commonAuthScreens,
    },
  },
});

export const Navigation = createStaticNavigation(RootStackNavigator);

type RootStackType = typeof RootStackNavigator;

declare module "@react-navigation/core" {
  interface RootNavigator extends RootStackType {}
}
