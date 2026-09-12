import * as Sentry from "@sentry/react-native";
import {
  NativeAd,
  NativeAdChoicesPlacement,
} from "react-native-google-mobile-ads";
import { initializeAdsWhenPermitted } from "#/lib/adsInit";
import { adUnits } from "#/lib/adUnits";
import { getCachedAd, setCachedAd } from "#/utils/ad-cache";

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One ad request, with its own timeout independent of the retry loop above
 * it. The underlying native request has no cancellation API, so a timed-out
 * attempt can still resolve later — that ad belongs to nobody by then, so it
 * gets destroyed rather than leaked.
 */
function requestOnce(): Promise<NativeAd> {
  let settled = false;

  const adPromise = initializeAdsWhenPermitted().then(() =>
    NativeAd.createForAdRequest(adUnits.native, {
      adChoicesPlacement: NativeAdChoicesPlacement.BOTTOM_RIGHT,
    })
  );

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
        // Image ads only — no video player in any layout that renders
        // these. Treated as a soft failure, same retry budget as no-fill.
        if (ad.mediaContent?.hasVideoContent) {
          ad.destroy();
          reject(new Error("video ad rejected — image only"));
          return;
        }
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
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const ad = await requestOnce();
      setCachedAd(tab, id, ad);
      return ad;
    } catch (error) {
      Sentry.addBreadcrumb({
        category: "gAd",
        data: { attempt, error: (error as Error)?.message, id },
        level: "info",
        message: "attempt failed",
      });
      if (attempt < MAX_RETRIES) {
        const backoff = RETRY_BACKOFF_MS[attempt - 1] ?? 1000;
        await delay(backoff);
      }
    }
  }
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
