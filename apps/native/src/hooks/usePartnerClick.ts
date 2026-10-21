import type { PartnerContent } from "@news-spend-media/payload/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useState } from "react";
import { Platform } from "react-native";

import { orpc } from "#/lib/orpc";
import { navigate } from "#/navigation/navigationUtils";
import type { AdPlacement } from "#/state/adManager";
import { authState } from "#/state/auth";
import { openStoreLink } from "#/utils/openStoreLink";

import { usePartnerEvents } from "./usePartnerEvents";

/**
 * Mint the click id here rather than waiting for the server to return one.
 *
 * The id only has to be in the outbound URL and on the conversion row; there
 * is nothing the server knows that is needed to choose it. Generating it here
 * means the link opens immediately and the click is reported in the
 * background, instead of the tap sitting on a spinner for up to three seconds
 * while four sequential queries run.
 *
 * Shape matches the server's own generator, which still runs when no id is
 * supplied. Collisions cannot do harm: `clickId` is unique-indexed, so a
 * replayed id fails the insert rather than touching the existing row.
 */
const mintClickId = () =>
  `clk_${Crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

/** Taps on the same item this close together are one tap to the partner. */
const DOUBLE_TAP_WINDOW_MS = 1000;

/**
 * When each item was last tapped. Module-level rather than state: state only
 * covered signed-in taps and does not survive a remount of the card.
 */
const lastTapAt = new Map<string, number>();

/** True when this tap repeats one on the same item inside the window. */
function isRepeatTap(itemId: string, now: number): boolean {
  for (const [id, at] of lastTapAt) {
    if (now - at >= DOUBLE_TAP_WINDOW_MS) {
      lastTapAt.delete(id);
    }
  }
  const repeat = lastTapAt.has(itemId);
  if (!repeat) {
    lastTapAt.set(itemId, now);
  }
  return repeat;
}

export function usePartnerClick() {
  const trackClickMutation = useMutation(
    orpc.partnerConversions.trackClick.mutationOptions()
  );
  const queryClient = useQueryClient();
  const { trackClick: trackClickEvent } = usePartnerEvents();
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);

  /**
   * A tap can change what an earn surface should show: a recorded click turns
   * an offer "pending", and an award hides it. Whatever the outcome, the lists
   * are re-read rather than left to be stale until their next refetch.
   */
  const refreshOfferLists = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.partnerContent.filtered.key(),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.activity.pendingOffers.key(),
      }),
    ]);

  /**
   * `surface` is the placement the item was requested with, not where it is
   * drawn. The server uses it to decide whether the tap may pay out: only an
   * offer placement does, an ad placement records the click and nothing else.
   */
  const handleClick = async (item: PartnerContent, surface: AdPlacement) => {
    if (loadingItemId === item.id) {
      return;
    }

    /**
     * Every partner tap is tracked, not just webhook/postback ones.
     *
     * A "manual" partner is exactly the case `awardOnClick` exists for — a
     * partner with no way to confirm a conversion — and that setting is only
     * read inside `trackClick`'s handler. Skipping the call for anything but
     * webhook/postback partners made `awardOnClick` unreachable for the
     * partners it was built for: the offer just opened, with nothing ever
     * recorded and no way for it to be completed regardless of the setting.
     *
     * Guests are still excluded, not merely unlucky: `trackClick` is a
     * no-guest procedure and rejects them outright. Attempting it anyway
     * spent a round trip to earn a FORBIDDEN, which the catch below then
     * reported as "Connection slow" — a wrong explanation for a request
     * that was never going to succeed.
     */
    const shouldTrackClick = !authState.user?.isAnonymous;

    // Store links have to leave the app: the App Store / Play Store cannot
    // render in a WebView. Website links stay in the in-app browser.
    const storeUrl = Platform.select({
      ios: item.links?.iosAppStore,
      android: item.links?.androidPlayStore,
    });
    let url = storeUrl ?? item.links?.website;

    if (!url) {
      return;
    }

    const isStoreLink = Boolean(storeUrl);

    // Recorded for everyone, guests included, and independent of the CPA
    // mutation below: this feeds the partner's tap count, not attribution.
    // A repeat tap inside the window still opens the link, but is not
    // reported again, to the event feed or to the CPA mutation.
    const repeatTap = isRepeatTap(item.id, Date.now());
    if (!repeatTap) {
      trackClickEvent(item.id, surface);
    }

    if (shouldTrackClick && !repeatTap) {
      const clickId = mintClickId();
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}clickId=${clickId}`;

      /**
       * Deliberately not awaited. The id is already in the URL, so nothing
       * downstream is waiting on this: the conversion row it writes is read
       * later by the partner's postback, not by anything happening now.
       *
       * A failure here loses attribution for this one tap, which is why it is
       * logged. It is not worth holding the link open for — the previous
       * version made every CPA tap pay that latency to learn an id it could
       * just as well have chosen itself.
       */
      /**
       * `loadingItemId` no longer gates the link — it is now only a
       * de-duplication guard. Without an await between tap and open, a double
       * tap would report the same tap twice under two different ids and
       * inflate the partner's click count.
       */
      setLoadingItemId(item.id);
      trackClickMutation
        .mutateAsync({ partnerContentId: item.id, clickId, surface })
        .catch((error) => {
          console.error("Failed to track click:", error);
        })
        .finally(() => {
          setLoadingItemId(null);
          refreshOfferLists().catch(() => undefined);
        });
    }

    const openInApp = (target: string) =>
      navigate("InAppBrowser", {
        url: target,
        title: item.title,
        confirmOnLeave: false,
      });

    if (isStoreLink) {
      // If no store route opens, show the page rather than leave the tap dead.
      if (!(await openStoreLink(url))) {
        openInApp(url);
      }
      return;
    }

    navigate("InAppBrowser", {
      url,
      title: item.title,
      /**
       * No warning on the way out, for a CPA offer least of all.
       *
       * Nothing is forfeited by leaving: the click was recorded the moment it
       * was tapped, and the reward, points, and the Featured Offer that
       * counts towards Tier 1, arrives when the partner confirms the
       * conversion on its webhook. That happens whether this screen is open or
       * not.
       *
       * Warning otherwise argues against the step some offers require. An
       * "install this app" offer is completed by leaving for the store, so
       * telling someone they are about to lose their reward is both untrue and
       * pointed at the wrong action. A game still warns: leaving one really
       * does abandon it, and that lives on the game's own navigation.
       */
      confirmOnLeave: false,
    });
  };

  const isLoading = (itemId: string) => loadingItemId === itemId;

  return { handleClick, isLoading };
}
