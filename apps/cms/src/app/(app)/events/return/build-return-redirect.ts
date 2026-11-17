import { SHARE_URL } from "@news-spend-media/payload/lib/appSettings";

/**
 * Where Shows sends the buyer after payment: the app's order page, given the
 * purchase reference it handed us. No purchase means the app root.
 */
export function buildReturnRedirect(purchase?: string | null): string {
  if (!purchase) {
    return `${SHARE_URL}/`;
  }

  return `${SHARE_URL}/events/order/${encodeURIComponent(purchase)}`;
}
