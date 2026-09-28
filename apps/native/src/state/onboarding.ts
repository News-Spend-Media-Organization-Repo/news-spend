import { storage } from "#/utils/storage";

const HAS_SEEN_ONBOARDING_KEY = "HAS_SEEN_ONBOARDING";

/**
 * Snapshot read once at startup, so the onboarding group's `if` condition can
 * only change when auth status does. Re-reading the flag on every render would
 * let it flip while an onboarding route is on screen, unmounting the route the
 * user is looking at.
 */
export const seenOnboardingAtLaunch =
  storage.getBoolean(HAS_SEEN_ONBOARDING_KEY) ?? false;

/** Called on every way out of onboarding: skip, sign up and log in. */
export function markOnboardingSeen(): void {
  storage.set(HAS_SEEN_ONBOARDING_KEY, true);
}
