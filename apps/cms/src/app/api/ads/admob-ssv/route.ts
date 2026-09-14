import { getPayload } from "@news-spend-media/payload";
import { verifySsvCallback } from "@news-spend-media/payload/lib/giveaway/admobSsv";
import {
  BOOST_SSV_PURPOSE,
  recordGoogleBoost,
} from "@news-spend-media/payload/lib/giveaway/googleBoost";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * GET /api/ads/admob-ssv
 *
 * Google's server-side verification callback for rewarded ads. Called by
 * Google, not by the app, and deliberately unauthenticated: there is no
 * session to present, and the signature over the query string is the
 * credential. `requireAdmin` would make the route unreachable by the only
 * caller it has.
 *
 * That makes the signature check non-negotiable. Routes under `app/api/*` sit
 * outside the `(payload)` group, so nothing else guards this path, and without
 * verification it would be an open endpoint for minting giveaway eligibility.
 * Nothing is read out of the query string before `verifySsvCallback` returns
 * ok.
 */

/**
 * Every answer Google can be given, and why.
 *
 * Google retries a callback that does not return 2xx, so the status code is a
 * request for redelivery rather than a description of what we thought of the
 * call. A refusal we are sure about is a 200: the message says it was not
 * credited, and repeating it would not change that. Only a failure on our side
 * asks for the reward to be sent again.
 */
export async function GET(req: NextRequest) {
  const verification = await verifySsvCallback(req.url);

  if (!verification.ok) {
    /*
     * We could not reach Google's key set, so this callback has not been
     * judged at all. Ask for it again rather than discard what may be a
     * genuine reward.
     */
    if (verification.reason === "keys_unavailable") {
      return NextResponse.json(
        { error: "verifier_keys_unavailable" },
        { status: 503 }
      );
    }

    /*
     * Anything else failed verification on its own terms — a bad signature, a
     * replayed-and-stale timestamp, a missing parameter. Refused flatly, and
     * without echoing which check failed: an unauthenticated caller probing
     * this endpoint should not be handed a description of the lock.
     */
    return NextResponse.json({ error: "invalid_callback" }, { status: 403 });
  }

  /*
   * A rewarded impression from a surface that was not asking for a Boost is
   * answered without touching the database at all.
   *
   * Only relevant while the callback sits on an ad unit the whole app shares:
   * every rewarded impression anywhere then arrives here, and opening a
   * Payload connection to decide it was none of our business is a cost per
   * impression rather than per Boost. Harmless once the Boost surface has an
   * ad unit of its own, and still the cheapest possible answer to a caller
   * probing the endpoint with a signature it somehow holds.
   */
  if (!verification.callback.customData?.includes(BOOST_SSV_PURPOSE)) {
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  }

  try {
    const payload = await getPayload();
    const outcome = await recordGoogleBoost(payload, verification.callback);

    if (outcome.status === "error") {
      return NextResponse.json({ error: "record_failed" }, { status: 503 });
    }

    return NextResponse.json({ status: outcome.status }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "record_failed" }, { status: 503 });
  }
}
