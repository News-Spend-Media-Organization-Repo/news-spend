import { buildReturnRedirect } from "./build-return-redirect";

/**
 * GET /events/return?purchase=<reference>
 *
 * The URL registered with Shows for a completed checkout. Hands the buyer
 * straight back to the app and nothing else: it never claims the payment
 * succeeded and never reads order status — the app asks the API what happened.
 * `no-store` so a cached redirect can never replay a stale reference.
 */
export function GET(request: Request): Response {
  const purchase = new URL(request.url).searchParams.get("purchase");

  return new Response(null, {
    status: 302,
    headers: {
      Location: buildReturnRedirect(purchase),
      "Cache-Control": "no-store",
    },
  });
}
