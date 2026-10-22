import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";
import { useSnapshot } from "valtio";

import { authState } from "#/state/auth";
import { storage } from "#/utils/storage";

import { maybeRequestReview } from "./index";

const LOYAL_CHECKED_AT_KEY = "review.loyalCheckedAt";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Home focuses seen this app session; the first is the cold start. */
let focusCount = 0;
let askedThisSession = false;

/** Forget this session's state. Only tests need it: the flags live for the app's lifetime. */
export function resetLoyalReviewPromptSession(): void {
  focusCount = 0;
  askedThisSession = false;
}

/**
 * Ask a loyal reader for a review, at a calm moment.
 *
 * "Loyal" is the server's call (account age, active days, sessions and at
 * least one earning activity), so this only chooses when to ask. Returning to
 * Home is the moment: the reader has just finished something, and nothing is
 * mid-flight. The first focus of a session is skipped because that is the app
 * opening, not a reader coming back.
 *
 * The server answers "not loyal yet" without recording anything, so a normal
 * reader would otherwise trigger the engagement check on every Home visit. The
 * daily local stamp is what stops that.
 */
export function useLoyalReviewPrompt(): void {
  const { user } = useSnapshot(authState);
  const eligible = Boolean(user) && user?.isAnonymous !== true;

  useFocusEffect(
    useCallback(() => {
      if (!eligible) {
        return;
      }

      focusCount += 1;
      if (focusCount === 1 || askedThisSession) {
        return;
      }

      const checkedAt = storage.getNumber(LOYAL_CHECKED_AT_KEY);
      if (
        checkedAt !== undefined &&
        Date.now() - checkedAt < CHECK_INTERVAL_MS
      ) {
        return;
      }

      askedThisSession = true;
      storage.set(LOYAL_CHECKED_AT_KEY, Date.now());
      maybeRequestReview("LOYAL_USER");
    }, [eligible])
  );
}
