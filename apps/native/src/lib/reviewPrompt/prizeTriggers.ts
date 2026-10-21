import { useEffect } from "react";

import { maybeRequestReview } from "./index";

type ClaimResult = {
  awaitingVerification: boolean;
  underReview: boolean;
  fulfilmentStatus: string;
};

type PrizeState = {
  id: string;
  claimStatus: string;
  fulfilmentStatus: string;
};

/**
 * A claim is a good moment unless the winner still has something to do or the
 * payout is being held. Neither is a payoff, and asking someone for a review
 * while they are being sent to verify their identity is exactly the wrong time.
 */
export function shouldPromptAfterClaim(result: ClaimResult): boolean {
  return !(
    result.awaitingVerification ||
    result.underReview ||
    result.fulfilmentStatus === "on_hold"
  );
}

/** Fire-and-forget: the claim screen must not wait on a review prompt. */
export function reviewAfterClaim(result: ClaimResult): void {
  if (shouldPromptAfterClaim(result)) {
    maybeRequestReview("PRIZE_CLAIMED");
  }
}

/**
 * Ask when the user is looking at a prize that has actually been delivered.
 *
 * Airtime, data and gift cards settle after the claim, so this is how those
 * prizes get their moment: the next time the user opens one. Points are
 * fulfilled at claim time and reach the same state at once; the shared 90-day
 * cap means that never produces a second prompt.
 */
export function usePrizeDeliveredReview(prize: PrizeState | undefined): void {
  const id = prize?.id;
  const delivered =
    prize?.claimStatus === "claimed" && prize?.fulfilmentStatus === "fulfilled";

  useEffect(() => {
    if (id && delivered) {
      maybeRequestReview("PRIZE_DELIVERED");
    }
  }, [id, delivered]);
}
