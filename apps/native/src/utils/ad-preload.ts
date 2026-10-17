import { ensureNativeAdLoaded } from "#/utils/ad-loader";

/**
 * How many rows past the last one on screen still get their ad requested.
 *
 * Roughly a screen and a half. Google's guidance for native ads in a list is
 * to limit what is cached to what is needed and to destroy what is not, and
 * the same lazy-loading idea (fetch a bounded distance ahead of the viewport)
 * is how web ad tags handle long scrolling pages. Requesting every slot the
 * moment a page arrived meant most loaded ads were never seen: AdMob reported
 * about one matched request in five shown, and a pile of requests in flight at
 * once drew Google's "too many recently failed requests" throttle.
 */
export const AD_LOOKAHEAD_ROWS = 10;

type Row = { _type?: string; type?: string; id?: string } | null | undefined;

/**
 * Starts loading the Google ad slots from the top of the feed down to
 * `AD_LOOKAHEAD_ROWS` rows past `lastVisibleIndex`. Slots beyond that load
 * when they get close, or when their row mounts. Safe to call repeatedly:
 * a slot already loaded or loading is a no-op.
 */
export const preloadAdsAhead = (
  tab: string,
  rows: readonly unknown[] | undefined,
  lastVisibleIndex: number
) => {
  if (!rows) {
    return;
  }
  const limit = Math.min(rows.length - 1, lastVisibleIndex + AD_LOOKAHEAD_ROWS);
  for (let index = 0; index <= limit; index++) {
    const row = rows[index] as Row;
    if (row?._type === "ad" && row.type === "gAd" && row.id) {
      ensureNativeAdLoaded(tab, row.id);
    }
  }
};
