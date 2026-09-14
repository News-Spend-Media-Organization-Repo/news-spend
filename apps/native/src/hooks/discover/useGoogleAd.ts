import { useEffect, useMemo } from "react";
import {
  type RequestOptions,
  useRewardedInterstitialAd,
} from "react-native-google-mobile-ads";

import { initializeAdsWhenPermitted } from "#/lib/adsInit";
import { adUnits } from "#/lib/adUnits";

type UseGoogleAdOptions = {
  onRewarded?: () => void;
  onClosed?: () => void;
  /**
   * Ask Google to verify this impression with our server before it counts.
   *
   * Set only where the reward is worth something. Google sends these two
   * values back to the verification callback alongside its signature, which is
   * how the server learns whose Boost an impression was and that it was meant
   * as one at all. Everywhere else this stays undefined and the reward is
   * whatever the screen makes of it locally.
   *
   * Passing this also selects the ad unit, because only one of them has a
   * callback configured against it. See below.
   */
  serverSideVerification?: { userId: string; customData: string };
};

type UseGoogleAdReturn = {
  isLoaded: boolean;
  show: () => void;
  load: () => void;
};

/**
 * Wraps the Google rewarded interstitial ad lifecycle.
 * Automatically reloads after the ad closes.
 * Fires `onRewarded` if the user earned a reward, `onClosed` in either case.
 */
export function useGoogleAd({
  onRewarded,
  onClosed,
  serverSideVerification,
}: UseGoogleAdOptions = {}): UseGoogleAdReturn {
  /*
   * Memoised on the values rather than the object, because these become the
   * ad request. A fresh object every render is a fresh request every render,
   * which throws away a loaded ad to start fetching the same one again.
   */
  const ssvUserId = serverSideVerification?.userId;
  const ssvCustomData = serverSideVerification?.customData;

  const requestOptions = useMemo<RequestOptions | undefined>(() => {
    if (!(ssvUserId && ssvCustomData)) {
      return;
    }
    return {
      serverSideVerificationOptions: {
        userId: ssvUserId,
        customData: ssvCustomData,
      },
    };
  }, [ssvUserId, ssvCustomData]);

  /**
   * The ad unit follows the verification options rather than being chosen
   * beside them.
   *
   * These two have to agree: the callback is configured per ad unit, so
   * verification options on the general unit are never sent anywhere, and the
   * Boost unit without them produces a callback the server cannot attribute to
   * anybody. Both failures are silent — the ad plays, the reward is earned,
   * and nothing is credited. Deriving one from the other is what stops a
   * caller getting the pair half right.
   */
  const adUnitId = requestOptions
    ? adUnits.boostRewardedInterstitial
    : adUnits.rewardedInterstitial;

  const { isLoaded, isClosed, load, show, isEarnedReward } =
    useRewardedInterstitialAd(adUnitId, requestOptions);

  useEffect(() => {
    let cancelled = false;
    initializeAdsWhenPermitted()
      .then(() => {
        if (!cancelled) {
          load();
        }
      })
      .catch((error) => {
        console.warn("Ad initialization failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!isClosed) {
      return;
    }
    if (isEarnedReward) {
      onRewarded?.();
    }
    onClosed?.();
    load();
  }, [isClosed, isEarnedReward, onRewarded, onClosed, load]);

  return { isLoaded, show, load };
}
