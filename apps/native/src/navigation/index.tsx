import { createStaticNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSnapshot } from "valtio";

import { authState } from "#/state/auth";
import { useNeedsOnboarding } from "#/state/onboarding";

import { commonAuthScreens, onboardingScreens } from "./common";
import { sharedScreens } from "./shared-screens";
import TabLayout from "./tab-navigator";

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
