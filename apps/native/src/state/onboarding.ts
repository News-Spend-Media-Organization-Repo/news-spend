import { proxy, useSnapshot } from "valtio";

import { storage } from "#/utils/storage";

const HAS_SEEN_ONBOARDING_KEY = "HAS_SEEN_ONBOARDING";

/**
 * Reactive, not a startup snapshot: the gate has to be able to close
 * mid-session. A snapshot still reading "not seen" from launch would let the
 * onboarding group come back the moment the user signs out again, dropping
 * them into a carousel they already finished.
 */
export const onboardingState = proxy({
  seen: storage.getBoolean(HAS_SEEN_ONBOARDING_KEY) ?? false,
});

/**
 * Onboarding is only for signed-out users who have never finished it. In its
 * own module so the gate can be tested without booting the navigator.
 */
export function useNeedsOnboarding(isSignedOut: boolean): boolean {
  const { seen } = useSnapshot(onboardingState);
  return isSignedOut && !seen;
}

/** Called on every way out of onboarding: skip and the last page's CTA. */
export function markOnboardingSeen(): void {
  if (!onboardingState.seen) {
    onboardingState.seen = true;
  }
  storage.set(HAS_SEEN_ONBOARDING_KEY, true);
}
