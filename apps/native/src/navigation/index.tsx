import { createStaticNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSnapshot } from "valtio";

import { authState } from "#/state/auth";
import { seenOnboardingAtLaunch } from "#/state/onboarding";

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
 * Onboarding only for signed-out users who have never finished it, and only
 * for this session: `seenOnboardingAtLaunch` is a startup snapshot, so the
 * group can't drop away underneath the route that is on screen.
 */
function useNeedsOnboarding() {
  const { status } = useSnapshot(authState);
  return status === "signOut" && !seenOnboardingAtLaunch;
}

const RootStackNavigator = createNativeStackNavigator({
  screenOptions: {
    headerShown: false,
    animation: "slide_from_right",
  },
  groups: {
    // First group, so it wins the initial route when its condition holds.
    Onboarding: {
      if: useNeedsOnboarding,
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
