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

/**
 * What share of actionable load failures to report to Sentry.
 *
 * A feed carries several gAd slots, so one bad feed load used to file one
 * event per slot — bursts of same-second events from a single user. Sampling
 * keeps the signal (are timeouts spiking on some build?) while bounding the
 * volume.
 */
const ACTIONABLE_FAILURE_SAMPLE_RATE = 0.1;

/**
 * Exhaustion causes that are expected inventory outcomes, not bugs: Google
 * having no ad to serve (no-fill), a video creative this image row cannot
 * show, or a repeat of an ad already on screen. The slot collapsing is the
 * correct behaviour, so these are recorded as a breadcrumb — context for a
 * future real event — rather than filing an issue each (E2/EA: ~1,600
 * events/month of normal AdMob behaviour).
 *
 * Anything else (request timeouts, SDK init failures, unknown SDK errors) is
 * actionable and sampled below.
 */
const EXPECTED_FAILURE_RE =
  /no-fill|no ad to show|video ad, rejected|repeat ad/i;

/** One shared promise per (tab, id) — concurrent callers (an eager preload
 * walk and a slot mounting before that preload finished) await the same
 * request instead of firing a duplicate one. */
const inFlight = new Map<string, Promise<NativeAd | null>>();

/**
 * Ad requests go out a couple at a time.
 *
 * The feed preloads every ad slot the moment a page arrives, so a page with
 * four slots fired four requests at the same ad unit in the same instant, and
 * Google answered them with the same creative. Fully serial requests fixed
 * that, but made every slot wait behind all the ones before it, so one
 * timed-out request (10s) held the rest of the feed at the "Advertisement"
 * placeholder. Two at a time keeps requests staggered enough to see different
 * auctions (the duplicate check below catches what slips through) while a
 * slow request only delays one other slot. Retry backoff happens outside the
 * queue, so a slot waiting to retry never holds up the others.
 */
const MAX_CONCURRENT_REQUESTS = 2;
let activeRequests = 0;
const waiting: Array<() => void> = [];

async function enqueue<T>(task: () => Promise<T>): Promise<T> {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  activeRequests++;
  try {
    return await task();
  } finally {
    activeRequests--;
    waiting.shift()?.();
  }
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
    // A video that does serve plays silently: this is a list a reader is
    // scrolling through, often on mobile data, not a player they opened.
    startVideoMuted: true,
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
   * A video creative is a last resort, not a rejection.
   *
   * The row's media view is Google's own NativeMediaView, which plays video
   * itself, and it is sized past Google's 120 floor for video. A still image
   * still fits the row better and costs the reader less data, so an image is
   * preferred and the remaining attempts go looking for one. But iOS native
   * inventory skews heavily to video, and refusing it outright left those
   * slots with no Google ad at all, so the first video is held aside and used
   * if no image turns up.
   */
  let video: NativeAd | null = null;
  const isVideo = (ad: NativeAd) => Boolean(ad.mediaContent?.hasVideoContent);

  /**
   * Among usable ads, prefer one no other slot in this feed is already
   * showing. A repeat is what readers actually complain about, so it is held
   * back in favour of a later attempt — but never rejected, because spending
   * the whole retry budget chasing a better creative collapsed slots that did
   * have servable fill.
   */
  let best: NativeAd | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const ad = await enqueue(requestOnce);

      if (isVideo(ad)) {
        if (video) {
          ad.destroy();
        } else {
          video = ad;
        }
        failures.push(`attempt ${attempt}: video ad, looking for an image`);
      } else {
        const isRepeat = isDuplicateInTab(tab, id, ad);

        // An ad already on screen elsewhere is not an improvement on the one
        // already in hand; keep what we have and try again.
        if (best && isRepeat) {
          ad.destroy();
          failures.push(
            `attempt ${attempt}: repeat ad, retrying for a better one`
          );
        } else {
          best?.destroy();
          best = ad;
          if (isRepeat) {
            failures.push(
              `attempt ${attempt}: repeat ad, retrying for a better one`
            );
          } else {
            break;
          }
        }
      }
    } catch (error) {
      failures.push(`attempt ${attempt}: ${(error as Error)?.message}`);
    }

    if (attempt < MAX_RETRIES) {
      await delay(RETRY_BACKOFF_MS[attempt - 1] ?? 1000);
    }
  }

  // Something arrived, even if not ideal: showing it beats collapsing the slot.
  // An image wins over a video, and the video is released if it is not used.
  const chosen = best ?? video;
  if (best && video) {
    video.destroy();
  }
  if (chosen) {
    setCachedAd(tab, id, chosen);
    return chosen;
  }

  // Breadcrumbs alone never leave the device — they only ride along with a
  // later event — so total failures used to be reported as their own event.
  // That made every no-fill (the overwhelmingly common case) file a Sentry
  // issue per slot. Now only actionable failures (timeouts, init failures,
  // unknown SDK errors) report, sampled; expected inventory outcomes leave a
  // breadcrumb for context instead.
  const actionable = failures.some((f) => !EXPECTED_FAILURE_RE.test(f));
  if (actionable && Math.random() < ACTIONABLE_FAILURE_SAMPLE_RATE) {
    Sentry.captureMessage("gAd failed after all retries", {
      level: "warning",
      tags: { adPlatform: Platform.OS, adTab: tab ?? "default" },
      extra: { adUnit: adUnits.native, failures, slotId: id },
    });
  } else {
    Sentry.addBreadcrumb({
      category: "ads",
      message: "gAd slot collapsed",
      data: {
        adUnit: adUnits.native,
        failures,
        slotId: id,
        tab: tab ?? "default",
      },
      level: "warning",
    });
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
