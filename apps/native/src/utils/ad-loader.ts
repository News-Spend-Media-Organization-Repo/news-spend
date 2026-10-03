import * as Sentry from "@sentry/react-native";
import { Platform } from "react-native";
import {
  NativeAd,
  NativeAdChoicesPlacement,
} from "react-native-google-mobile-ads";
import { initializeAdsWhenPermitted } from "#/lib/adsInit";
import { adUnits } from "#/lib/adUnits";
import { getCachedAd, isDuplicateInTab, setCachedAd } from "#/utils/ad-cache";

const MAX_RETRIES = 3;

/** How long to wait for a single ad request before treating it as timed out. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Backoff before each retry, in ms.
 *
 * The overwhelmingly common failure here is no-fill — Google having no ad to
 * serve this user right now — and three requests in the same handful of
 * milliseconds get the same answer three times, burning the retry budget on
 * what is really one attempt.
 */
const RETRY_BACKOFF_MS = [1000, 3000, 9000];

const makeKey = (tab: string | undefined, id: string) =>
  `${tab ?? "default"}:${id}`;

/** One shared promise per (tab, id) — concurrent callers (an eager preload
 * walk and a slot mounting before that preload finished) await the same
 * request instead of firing a duplicate one. */
const inFlight = new Map<string, Promise<NativeAd | null>>();

/**
 * Ad requests go out one at a time.
 *
 * The feed preloads every ad slot the moment a page arrives, so a page with
 * four slots fired four requests at the same ad unit in the same instant, and
 * Google answered them with the same creative. Taking turns lets each request
 * see a different auction, and gives the duplicate check below something to
 * compare against. Only the request itself queues: retry backoff happens
 * outside the queue, so one slot waiting to retry never holds up the others.
 */
let requestQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = requestQueue.then(task, task);
  requestQueue = run.catch(() => undefined);
  return run;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One ad request, with its own timeout independent of the retry loop above
 * it. The underlying native request has no cancellation API, so a timed-out
 * attempt can still resolve later — that ad belongs to nobody by then, so it
 * gets destroyed rather than leaked.
 *
 * SDK initialization is awaited *before* the timeout is armed, deliberately.
 * On iOS that step blocks on the App Tracking Transparency prompt, which is
 * gated on a human reading a dialog — folding that wait into a 10s ad-request
 * budget made every attempt on a first run time out before a request was even
 * sent, and the slot collapsed as if it were a no-fill.
 */
async function requestOnce(): Promise<NativeAd> {
  await initializeAdsWhenPermitted();

  let settled = false;

  const adPromise = NativeAd.createForAdRequest(adUnits.native, {
    // Bottom-left: the AD badge owns top-right, the Install pill owns
    // bottom-right, and top-left would sit on the thumbnail image. The row
    // reserves a strip under the thumbnail for it (ADCHOICES_GUTTER in
    // NewsItemGoogleAd), so the icon never lands on the creative.
    adChoicesPlacement: NativeAdChoicesPlacement.BOTTOM_LEFT,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error("ad request timed out"));
    }, REQUEST_TIMEOUT_MS);

    adPromise.then(
      (ad) => {
        clearTimeout(timer);
        if (settled) {
          // Timeout already won; this ad belongs to nobody.
          ad.destroy();
          return;
        }
        settled = true;
        resolve(ad);
      },
      (err) => {
        clearTimeout(timer);
        if (settled) {
          return;
        }
        settled = true;
        reject(err);
      }
    );
  });
}

async function loadWithRetries(
  tab: string | undefined,
  id: string
): Promise<NativeAd | null> {
  const failures: string[] = [];

  /**
   * How far an ad is from what we want: 0 is an image ad nobody else in this
   * feed is already showing. A repeat is worse than a video, because it is the
   * thing the feed's readers actually complain about; this layout is built for
   * a still image, so a video is the lesser evil. Neither is rejected
   * outright. Refusing them spent the whole retry budget on perfectly
   * servable fill, which on iOS (where native inventory skews heavily to
   * video) meant slots that had an ad available collapsed anyway.
   */
  const badness = (ad: NativeAd) =>
    (isDuplicateInTab(tab, id, ad) ? 2 : 0) +
    (ad.mediaContent?.hasVideoContent ? 1 : 0);

  let best: NativeAd | null = null;
  let bestBadness = Number.POSITIVE_INFINITY;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const ad = await enqueue(requestOnce);
      const adBadness = badness(ad);

      // Keep whichever of the two is closer to ideal, release the other.
      if (adBadness < bestBadness) {
        best?.destroy();
        best = ad;
        bestBadness = adBadness;
      } else {
        ad.destroy();
      }

      if (bestBadness === 0) {
        break;
      }
      failures.push(
        `attempt ${attempt}: ${bestBadness >= 2 ? "repeat" : "video"} ad, retrying for a better one`
      );
    } catch (error) {
      failures.push(`attempt ${attempt}: ${(error as Error)?.message}`);
    }

    if (attempt < MAX_RETRIES) {
      await delay(RETRY_BACKOFF_MS[attempt - 1] ?? 1000);
    }
  }

  // Something arrived, even if not ideal: showing it beats collapsing the slot.
  if (best) {
    setCachedAd(tab, id, best);
    return best;
  }

  // Breadcrumbs alone never leave the device — they only ride along with an
  // event — so a total failure is reported as its own event. Without this,
  // "the slot collapsed" is indistinguishable from no-fill, a timeout, an
  // init failure, or a misconfigured ad unit.
  Sentry.captureMessage("gAd failed after all retries", {
    level: "warning",
    tags: { adPlatform: Platform.OS, adTab: tab ?? "default" },
    extra: { adUnit: adUnits.native, failures, slotId: id },
  });
  return null;
}

/**
 * Loads a native ad for (tab, id) — cache-first, request-shared, and never
 * rejects (resolves `null` once every retry is exhausted, so callers don't
 * need their own try/catch).
 *
 * The single entry point for loading a gAd slot, called both by an eager
 * preload walk over the feed data (as soon as a page loads, independent of
 * scroll position) and by the slot's own component on mount, as a fallback
 * for whatever the preload walk hasn't reached yet. Both share the same
 * cache and in-flight map, so whichever gets there first does the real work.
 */
export function ensureNativeAdLoaded(
  tab: string | undefined,
  id: string
): Promise<NativeAd | null> {
  const cached = getCachedAd(tab, id);
  if (cached) {
    return Promise.resolve(cached);
  }

  const key = makeKey(tab, id);
  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const promise = loadWithRetries(tab, id).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
