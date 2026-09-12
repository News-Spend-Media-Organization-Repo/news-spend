import { useRecyclingEffect } from "@legendapp/list/react-native";
import * as Sentry from "@sentry/react-native";
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import {
  NativeAd,
  NativeAdChoicesPlacement,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from "react-native-google-mobile-ads";
import { initializeAdsWhenPermitted } from "#/lib/adsInit";
import { adUnits } from "#/lib/adUnits";
import { getCachedAd, setCachedAd } from "#/utils/ad-cache";
import { SCREENSHOT_MODE } from "#/utils/screenshotMode";
import { Text } from "../heroui/text";

export type NewsItemGoogleAdProp = {
  index: number;
  item: any;
  tab?: string;
  fromFallback?: boolean;
  ref?: React.Ref<NewsItemGoogleAdRef>;
};

export type NewsItemGoogleAdRef = {
  loadAd: () => void;
  isAdLoaded: () => boolean;
};

const MAX_RETRIES = 3;

/** How long to wait for a single ad request before treating it as timed out. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Backoff before each retry, in ms.
 *
 * Retries used to fire immediately, one after another. The overwhelmingly
 * common failure here is no-fill — Google having no ad to serve this user
 * right now — and three requests in the same handful of milliseconds get the
 * same answer three times, burning the retry budget on what is really one
 * attempt.
 */
const RETRY_BACKOFF_MS = [1000, 3000, 9000];

/**
 * Well past the ~40s structural worst case (3 attempts x 10s timeout, plus
 * backoff). If a slot is still neither loaded nor terminally failed by
 * this point, something outside the retry/timeout logic itself is wrong —
 * captured to Sentry with the full breadcrumb trail for diagnosis, since
 * `console.log` is silently dropped in Release builds (no native log
 * bridge), which made this invisible to `xcrun simctl log stream` and
 * therefore untestable locally or on a device console.
 */
const STUCK_WATCHDOG_MS = 60_000;

function logAdEvent(message: string, data?: Record<string, unknown>) {
  Sentry.addBreadcrumb({ category: "gAd", data, level: "info", message });
}

const NewsItemGoogleAds = memo(
  ({ item, index, tab, ref: parentRef }: NewsItemGoogleAdProp) => {
    const [loading, setLoading] = useState(false);
    const [nativeAd, setNativeAd] = useState<NativeAd | null>(() =>
      getCachedAd(tab, item.id)
    );
    // Measured once via onLayout below; see the comment there.
    const [adViewHeight, setAdViewHeight] = useState(0);

    // loadingRef is the source of truth: never synced from state, always set imperatively.
    // This ensures loadAd() guards are accurate even when called synchronously inside
    // useRecyclingEffect (before the async setLoading state update has re-rendered).
    const loadingRef = useRef(false);
    const loadedRef = useRef(!!getCachedAd(tab, item.id));
    const attemptsRef = useRef(0);
    const itemRef = useRef(item);
    const tabRef = useRef(tab);
    itemRef.current = item;
    tabRef.current = tab;

    /**
     * Terminal failure: every attempt used up, no ad to show.
     *
     * Tracked separately from `loading` because the two need opposite
     * renderings. Previously there was no such state — after MAX_RETRIES
     * `loadAd` returned without setting anything, leaving `loading === false`
     * and `nativeAd === null`, which falls through to the "Advertisement"
     * placeholder and stays there. Nothing recovered it: the preload walk in
     * the feed calls `loadAd()` again, but the attempts guard makes that a
     * no-op, so the slot showed an empty labelled box for the rest of the
     * list's life. That is the blank-ad symptom.
     */
    const [failed, setFailed] = useState(false);
    // Mirrors `failed` for the watchdog below, which fires from a stale
    // closure and can't rely on state captured at schedule time.
    const failedRef = useRef(false);

    /**
     * Bumped whenever a request is superseded (timeout, recycle, unmount).
     *
     * A timed-out request is not actually cancellable, so its promise can
     * still resolve later — after a replacement request has already been
     * issued. Without this the late arrival overwrites the newer ad and the
     * loser is never destroyed, leaking a native ad object each time.
     */
    const generationRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimers = useCallback(() => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    }, []);

    const loadAd = useCallback(() => {
      logAdEvent("loadAd() called", {
        attempts: attemptsRef.current,
        itemId: itemRef.current?.id,
        loaded: loadedRef.current,
        loading: loadingRef.current,
      });
      if (loadedRef.current || loadingRef.current) {
        return;
      }
      if (attemptsRef.current >= MAX_RETRIES) {
        // Out of attempts: collapse the slot rather than leaving a labelled
        // empty box behind.
        logAdEvent("out of attempts at entry, collapsing", {
          itemId: itemRef.current?.id,
        });
        loadingRef.current = false;
        setLoading(false);
        setFailed(true);
        failedRef.current = true;
        return;
      }

      const generation = generationRef.current;
      attemptsRef.current += 1;
      loadingRef.current = true;
      setLoading(true);
      logAdEvent("starting attempt", {
        attempt: attemptsRef.current,
        generation,
        itemId: itemRef.current?.id,
      });

      /** True once this request has been superseded or the view has gone. */
      const isStale = () => generationRef.current !== generation;

      /** Give up on this attempt and schedule the next, with backoff. */
      const scheduleRetry = () => {
        if (isStale()) {
          return;
        }
        loadingRef.current = false;
        // `loading` stays true across the backoff: the slot is still going to
        // show an ad, so it should keep its placeholder rather than flicker
        // to collapsed and back.
        const delay =
          RETRY_BACKOFF_MS[attemptsRef.current - 1] ??
          RETRY_BACKOFF_MS.at(-1) ??
          1000;
        logAdEvent("scheduling retry", {
          attempts: attemptsRef.current,
          delay,
          itemId: itemRef.current?.id,
        });
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          if (isStale()) {
            return;
          }
          loadAd();
        }, delay);
      };

      timeoutTimerRef.current = setTimeout(() => {
        timeoutTimerRef.current = null;
        logAdEvent("TIMEOUT fired", {
          currentGeneration: generationRef.current,
          generation,
          itemId: itemRef.current?.id,
        });
        if (isStale()) {
          return;
        }
        // Supersede the in-flight request so a late resolution is discarded.
        generationRef.current += 1;
        loadingRef.current = false;
        if (attemptsRef.current >= MAX_RETRIES) {
          logAdEvent("out of attempts after timeout, collapsing", {
            itemId: itemRef.current?.id,
          });
          setLoading(false);
          setFailed(true);
          failedRef.current = true;
          return;
        }
        loadAd();
      }, REQUEST_TIMEOUT_MS);

      logAdEvent("calling initializeAdsWhenPermitted()", {
        itemId: itemRef.current?.id,
      });
      initializeAdsWhenPermitted()
        .then(() => {
          logAdEvent("initializeAdsWhenPermitted() resolved", {
            itemId: itemRef.current?.id,
          });
          return NativeAd.createForAdRequest(adUnits.native, {
            adChoicesPlacement: NativeAdChoicesPlacement.BOTTOM_RIGHT,
          });
        })
        .then((ad) => {
          logAdEvent("createForAdRequest RESOLVED", {
            hasVideo: ad.mediaContent?.hasVideoContent,
            itemId: itemRef.current?.id,
            stale: isStale(),
          });
          if (timeoutTimerRef.current) {
            clearTimeout(timeoutTimerRef.current);
            timeoutTimerRef.current = null;
          }
          // Superseded while in flight: this ad belongs to nobody, so release
          // it instead of leaking it.
          if (isStale()) {
            ad.destroy();
            return;
          }

          // Image ads only — this layout has no video player, and a video
          // asset rendered through NativeMediaView with nothing controlling
          // playback is worse than no ad. Treated as a soft failure: same
          // backoff and retry budget as a request that came back empty.
          if (ad.mediaContent?.hasVideoContent) {
            ad.destroy();
            if (attemptsRef.current >= MAX_RETRIES) {
              loadingRef.current = false;
              setLoading(false);
              setFailed(true);
              failedRef.current = true;
              return;
            }
            scheduleRetry();
            return;
          }

          attemptsRef.current = 0;
          setCachedAd(tabRef.current, itemRef.current.id, ad);
          loadedRef.current = true;
          loadingRef.current = false;
          setNativeAd(ad);
          setFailed(false);
          failedRef.current = false;
          setLoading(false);
        })
        .catch((err) => {
          logAdEvent("REJECTED", {
            error: err?.message ?? String(err),
            itemId: itemRef.current?.id,
          });
          if (timeoutTimerRef.current) {
            clearTimeout(timeoutTimerRef.current);
            timeoutTimerRef.current = null;
          }
          if (isStale()) {
            return;
          }
          if (attemptsRef.current >= MAX_RETRIES) {
            loadingRef.current = false;
            setLoading(false);
            setFailed(true);
            failedRef.current = true;
            return;
          }
          scheduleRetry();
        });
    }, []);

    // Abandon anything in flight when the cell goes away, so a late
    // resolution neither leaks an ad nor sets state on an unmounted view.
    useEffect(
      () => () => {
        generationRef.current += 1;
        clearTimers();
      },
      [clearTimers]
    );

    useImperativeHandle(parentRef, () => ({
      loadAd,
      isAdLoaded: () => loadedRef.current,
    }));

    // Fires on mount AND on every genuine recycle to a different ad item —
    // in principle. Confirmed by a live cold-start repro that it sometimes
    // never fires at all: a slot rendered its initial "loading" placeholder
    // once and then nothing, ever — no recycle, no loadAd() call, no
    // timeout, because nothing started one. That's the actual "stuck past
    // expected timeout" bug: not a flaw in the retry/timeout logic, but the
    // trigger for it never firing in the first place. The plain useEffect
    // below is the fallback — React's own mount guarantee doesn't depend on
    // this library's recycling-detection internals.
    const activateItem = useCallback(
      (recycledItem: { id: string }) => {
        const cached = getCachedAd(tabRef.current, recycledItem.id);
        attemptsRef.current = 0;
        loadedRef.current = !!cached;
        loadingRef.current = false;
        setFailed(false);
        failedRef.current = false;

        if (cached) {
          setNativeAd(cached as NativeAd);
          setLoading(false);
          return;
        }

        setNativeAd(null);
        setLoading(true);
        loadAd();

        const watchdogGeneration = generationRef.current;
        watchdogTimerRef.current = setTimeout(() => {
          watchdogTimerRef.current = null;
          // Superseded by a later recycle: whatever is stuck now belongs to
          // a slot this cell no longer represents.
          if (generationRef.current !== watchdogGeneration) {
            return;
          }
          if (!(loadedRef.current || failedRef.current)) {
            Sentry.captureMessage("gAd stuck past expected timeout", {
              extra: {
                attempts: attemptsRef.current,
                itemId: recycledItem?.id,
                loading: loadingRef.current,
              },
              level: "warning",
            });
          }
        }, STUCK_WATCHDOG_MS);
      },
      [loadAd]
    );

    useRecyclingEffect(({ item: recycledItem, prevItem }) => {
      const recycled = recycledItem as { id: string };
      const prev = prevItem as { id: string } | null;
      const isSameItem = prev != null && prev.id === recycled.id;
      if (isSameItem) {
        return;
      }
      // A recycle hands this cell a different ad slot, so whatever was in
      // flight for the previous one is now irrelevant.
      generationRef.current += 1;
      clearTimers();
      activateItem(recycled);
    });

    // Fallback: guaranteed by React itself to run once on mount, regardless
    // of whether useRecyclingEffect's own mount detection does. Only acts if
    // nothing has claimed this slot yet, so it's a no-op on the (usual) path
    // where useRecyclingEffect already did its job.
    const mountFallbackRan = useRef(false);
    useEffect(() => {
      if (mountFallbackRan.current) {
        return;
      }
      mountFallbackRan.current = true;
      if (loadedRef.current || loadingRef.current) {
        return;
      }
      activateItem(itemRef.current);
    }, [activateItem]);

    // Nothing will ever fill this slot: take up no space at all. A 90px box
    // reading "Advertisement" with nothing in it is worse than no box.
    if (failed && !nativeAd) {
      return null;
    }

    if (!nativeAd || loading) {
      return (
        <View className="min-h-22.5 items-center justify-center bg-background px-2.5 opacity-60">
          <Text className="font-bold text-p-500">Advertisement</Text>
        </View>
      );
    }

    return (
      <NativeAdView
        nativeAd={nativeAd}
        onLayout={(e) => {
          // AdMob's native ad validator flags "advertiser assets outside
          // native ad view" whenever this container's resolved height has a
          // fractional pixel component — `minHeight` alone can leave it
          // measuring a hair short of its (auto-sized) children, which is
          // enough for the assets to read as spilling past the boundary.
          // Pinning to the ceil'd measured height fixes it.
          const measuredHeight = Math.ceil(e.nativeEvent.layout.height);
          if (measuredHeight !== adViewHeight) {
            setAdViewHeight(measuredHeight);
          }
        }}
        style={{
          height: adViewHeight || undefined,
          minHeight: adViewHeight ? undefined : 90,
          width: "100%",
        }}
      >
        <View className="flex-row gap-4">
          {/*
            Sized and placed exactly like a NewsItem/NewsItemAd thumbnail —
            this ad is meant to read as a normal feed row, not stand out
            with its own banner layout. Media (not icon) is the thumbnail:
            AdMob requires every native ad to carry a media asset (one of
            three required assets alongside headline/CTA), so it's the one
            guaranteed to be there — this layout previously omitted it
            entirely, which was the dominant cause of "matched but never
            shown" (AdMob console: ~80-90% match rate, ~35-40% show rate).
          */}
          <NativeMediaView
            resizeMode="cover"
            style={{ borderRadius: 10, height: 100, width: 100 }}
          />

          <View className="flex-1 justify-center gap-4">
            <View className="flex-row justify-between gap-2">
              <NativeAsset assetType={NativeAssetType.HEADLINE}>
                <Text
                  className="flex-1 font-bold text-p-500"
                  ellipsizeMode="tail"
                  numberOfLines={2}
                >
                  {nativeAd.headline}
                </Text>
              </NativeAsset>
              <Text className="shrink-0 self-start rounded-sm border border-gray-50 px-1 text-s-300 text-xs">
                AD
              </Text>
            </View>

            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text ellipsizeMode="tail" numberOfLines={2}>
                {nativeAd.body}
              </Text>
            </NativeAsset>

            <View className="flex-row items-center justify-between">
              {nativeAd.store ? (
                <NativeAsset assetType={NativeAssetType.STORE}>
                  <Text className="text-p-500">{nativeAd.store}</Text>
                </NativeAsset>
              ) : (
                <View />
              )}
              <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                <Text className="rounded-full bg-s-300 px-2 py-1 text-white text-xs">
                  {nativeAd.callToAction}
                </Text>
              </NativeAsset>
            </View>
          </View>
        </View>
      </NativeAdView>
    );
  }
);

NewsItemGoogleAds.displayName = "NewsItemGoogleAds";

function NewsItemGoogleAdsGated(props: NewsItemGoogleAdProp) {
  if (SCREENSHOT_MODE) {
    return null;
  }
  return <NewsItemGoogleAds {...props} />;
}

export default NewsItemGoogleAdsGated;
