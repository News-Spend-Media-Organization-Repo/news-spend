import { getPayload } from "@news-spend-media/payload";
import { verifySsvCallback } from "@news-spend-media/payload/lib/giveaway/admobSsv";
import {
  BOOST_SSV_PURPOSE,
  recordGoogleBoost,
} from "@news-spend-media/payload/lib/giveaway/googleBoost";

/**
 * Google's server-side verification callback for rewarded ads (spec 7).
 *
 * Called by Google, never by the app, and unauthenticated in the usual sense:
 * Google holds no session with us, so the signature over the query string is
 * the ONLY thing between a forged request and giveaway eligibility. Nothing is
 * read out of the query before `verifySsvCallback` returns ok.
 *
 * It sits beside the Didit webhook rather than in the CMS because it is the
 * same kind of thing — an inbound third-party callback carrying its own proof
 * — and because this is the service built for app-scale traffic. The CMS is
 * the admin panel, capped low on memory and running no jobs; an advertising
 * callback has no business landing there.
 *
 * Registered ahead of the oRPC catch-all in the server entrypoint, so it never
 * passes through the shared public rate-limit bucket. Google decides how often
 * it calls us, and a limiter in front of it would drop Boosts people earned.
 *
 * Status codes are a retry protocol, not commentary. Google retries anything
 * that is not 2xx, so a refusal we are sure of returns 200 — repeating it
 * would not change the answer — and only a failure on our side asks for the
 * reward to be sent again.
 */
export async function admobSsvHandler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return json({ message: "Method not allowed" }, 405);
  }

  const verification = await verifySsvCallback(req.url);

  if (!verification.ok) {
    /*
     * We could not reach Google's key set, so this callback has not been
     * judged at all. Ask for it again rather than discard what may well be a
     * genuine reward.
     */
    if (verification.reason === "keys_unavailable") {
      return json({ message: "Verifier keys unavailable" }, 503);
    }

    /*
     * Failed verification on its own terms — a bad signature, a stale replay,
     * a missing parameter. Nothing is credited, and the answer is still 200.
     *
     * Two reasons, and neither is leniency. A signature that did not verify
     * will not verify on the tenth attempt either, so this is exactly the
     * "refusal we are sure of" that the status codes above exist to end: a
     * 4xx would have Google redeliver a forged or malformed callback
     * indefinitely. And AdMob will not accept a callback URL at all unless it
     * answers 2xx to the console's own unsigned verification ping, so a 403
     * here is not a strict endpoint — it is an endpoint that cannot be
     * configured, and a Boost nobody can earn.
     *
     * Refusing is still the security boundary; the status code never was.
     * Nothing below this branch runs, so no Boost is written and no database
     * connection is opened. The body stays neutral rather than naming the
     * check that failed, so a caller probing this is not handed a description
     * of the lock, and the reason goes to our logs instead — a run of
     * bad_signature is worth being able to see.
     */
    console.warn("[admob-ssv] callback rejected", {
      reason: verification.reason,
    });

    return json({ message: "Acknowledged", credited: false }, 200);
  }

  /*
   * A rewarded impression from a surface that was not asking for a Boost is
   * answered without opening a database connection. Only the Boost ad unit
   * carries this callback, so in practice this is belt and braces — and the
   * cheapest possible answer to a caller probing with a signature it somehow
   * holds. The authoritative parse still happens in `recordGoogleBoost`.
   */
  if (!verification.callback.customData?.includes(BOOST_SSV_PURPOSE)) {
    return json({ message: "Not a Boost", acknowledged: true }, 200);
  }

  try {
    const payload = await getPayload();
    const outcome = await recordGoogleBoost(payload, verification.callback);

    if (outcome.status === "error") {
      // A real fault on our side. 5xx so Google retries rather than dropping a
      // Boost somebody earned.
      payload.logger.error(
        {
          reason: outcome.reason,
          transactionId: verification.callback.transactionId,
        },
        "[admob-ssv] could not record boost"
      );
      return json({ message: "Could not record the Boost" }, 503);
    }

    payload.logger.info(
      {
        status: outcome.status,
        reason: outcome.status === "ignored" ? outcome.reason : undefined,
        userId: verification.callback.userId,
        transactionId: verification.callback.transactionId,
      },
      "[admob-ssv] callback processed"
    );

    return json({ message: "Processed", status: outcome.status }, 200);
  } catch (error) {
    console.error("[admob-ssv] callback failed", error);
    return json({ message: "Could not record the Boost" }, 503);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
