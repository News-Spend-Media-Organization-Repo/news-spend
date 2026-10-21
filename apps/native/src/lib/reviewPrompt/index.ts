import * as Sentry from "@sentry/react-native";
import { AppState } from "react-native";

import { client } from "#/lib/orpc";
import { storage } from "#/utils/storage";

import { loadStoreReview } from "./storeReview";

export { openStoreReviewPage } from "./storeLink";

export type ReviewTrigger = "PRIZE_CLAIMED" | "PRIZE_DELIVERED" | "LOYAL_USER";

const PROMPTED_AT_KEY = "review.promptedAt";
const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Let a screen transition or toast finish before anything asks the OS to draw
 * over it. A timer rather than `InteractionManager`, which React Native
 * removed in 0.88; a stack transition takes well under this.
 */
const SETTLE_MS = 1000;

/** One request at a time: a claim and a prize screen can fire in the same breath. */
let inFlight = false;

const settle = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, SETTLE_MS);
  });

function skipped(trigger: ReviewTrigger, reason: string) {
  Sentry.addBreadcrumb({
    category: "review",
    message: `review prompt skipped: ${reason}`,
    level: "info",
    data: { trigger },
  });
}

/**
 * Ask the OS to show its store-review dialog, if this user is due one.
 *
 * Never throws and never shows anything of its own: whether the dialog appears
 * is up to Apple and Google, and the user's flow must not depend on it. If any
 * check is unsure, it does not prompt.
 *
 * The server owns the 90-day cap, so it holds across devices and reinstalls;
 * the local stamp only saves a network call. Nothing here records, or claims to
 * know, that anyone left a review.
 */
export async function maybeRequestReview(
  trigger: ReviewTrigger
): Promise<void> {
  if (inFlight) {
    return;
  }
  inFlight = true;

  try {
    const storeReview = loadStoreReview();
    if (!(storeReview && (await storeReview.hasAction()))) {
      return skipped(trigger, "unavailable");
    }

    if (AppState.currentState !== "active") {
      return skipped(trigger, "inactive");
    }

    const lastPromptedAt = storage.getNumber(PROMPTED_AT_KEY);
    if (
      lastPromptedAt !== undefined &&
      Date.now() - lastPromptedAt < COOLDOWN_MS
    ) {
      return skipped(trigger, "cooldown_local");
    }

    await settle();

    // A single attempt: the client retries network errors by default, and a
    // review prompt must not be re-sent behind the user's back.
    const result = await client.review.recordPrompt(
      { trigger },
      { context: { retry: 0 } }
    );

    if (!result.won) {
      // Only a cooldown means the user was prompted recently. "Not loyal yet"
      // and "switched off" must not use up the local cap.
      if (result.reason === "cooldown") {
        storage.set(PROMPTED_AT_KEY, Date.now());
      }
      return skipped(trigger, result.reason);
    }

    storage.set(PROMPTED_AT_KEY, Date.now());
    await storeReview.requestReview();
  } catch (error) {
    Sentry.addBreadcrumb({
      category: "review",
      message: "review prompt failed",
      level: "warning",
      data: {
        trigger,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    inFlight = false;
  }
}
