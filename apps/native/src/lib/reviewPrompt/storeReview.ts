export type StoreReviewModule = {
  hasAction(): Promise<boolean>;
  requestReview(): Promise<void>;
};

/**
 * The only place `expo-store-review` is imported.
 *
 * It is a native module, so a build that predates it cannot run it even when
 * the JavaScript that calls it arrives by over-the-air update. Loading it here,
 * inside a try, turns that into "no prompt" instead of a crash at import time.
 */
export function loadStoreReview(): StoreReviewModule | null {
  try {
    // A top-level import would throw while the bundle loads on an old binary.
    return require("expo-store-review") as StoreReviewModule;
  } catch {
    return null;
  }
}
