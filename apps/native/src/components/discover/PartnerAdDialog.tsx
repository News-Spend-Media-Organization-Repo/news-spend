import type { PartnerContent } from "@news-spend-media/payload/types";
import { Dialog } from "heroui-native/dialog";
import { PressableFeedback } from "heroui-native/pressable-feedback";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Platform, useWindowDimensions, View } from "react-native";
import { Button } from "#/components/heroui/button";
import { Text } from "#/components/heroui/text";
import { useAdCountdown } from "#/hooks/discover/useAdCountdown";
import { useGoogleAd } from "#/hooks/discover/useGoogleAd";
import { usePartnerAd } from "#/hooks/discover/usePartnerAd";
import { useGlobalBackHandler } from "#/hooks/useBackHandler";
import {
  AD_IMPRESSION_DWELL_MS,
  usePartnerEvents,
} from "#/hooks/usePartnerEvents";
import { authClient } from "#/lib/authClient";
import { XIcon } from "#/lib/icons";
import { navigate } from "#/navigation/navigationUtils";
import type { AdPlacement } from "#/state/adManager";
import { resolvePartnerLink } from "#/utils/adLink";
import { resolveAdSurface } from "#/utils/adSurface";
import { openStoreLink } from "#/utils/openStoreLink";

import { PartnerAdContent } from "./partner-ad-content";

// ─── Types ────────────────────────────────────────────────────────────────────

/** The placements `usePartnerAd` asks for; reported surfaces must be one. */
const REQUESTED_SURFACES: AdPlacement[] = [
  "connect-brands-tab",
  "connect-brand-video",
];

export type PartnerAdDialogProps = {
  open?: boolean;
  setOpen?: (open: boolean) => void;
  /** Receives the partner item watched, or undefined for a Google ad. */
  onCountdownComplete?: (ad?: PartnerContent) => void;
  countdownDuration?: number;
  showAdLabel?: boolean;
  children?: ReactNode;
  triggerText?: string;
  triggerProps?: React.ComponentProps<typeof Button>;
  asChild?: boolean;
  onAdClick?: (ad: unknown) => void;
  onClose?: () => void;
  onOpen?: () => undefined | boolean;
  /** When true, hides the trigger button (useful when controlled externally) */
  hideTrigger?: boolean;
  /** When false, doesn't navigate to LuckyAppWall when ads unavailable (default: true) */
  fallbackToAppWall?: boolean;
  /**
   * Pin the rotation to one kind of advertisement instead of sampling it.
   *
   * For callers that must know in advance whether an ad can be shown: the
   * giveaway reveal sequences itself around the answer.
   */
  preferAdType?: "custom" | "native";
  /** Serving this so a Boost can be earned; see `usePartnerAd`. */
  forBoost?: boolean;
  /** Placement this dialog was opened from; reported with every event. */
  surface: AdPlacement;
  /**
   * There was genuinely nothing to show, as opposed to nothing yet.
   *
   * Opt-in: without it the dialog just falls back to the Lucky App Wall, which
   * from the outside is indistinguishable from the ad failing to load. A
   * caller that passes this can say why the person is being moved.
   */
  onUnavailable?: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PartnerAdDialog({
  open: externalOpen,
  setOpen: externalSetOpen,
  onCountdownComplete,
  countdownDuration = 15,
  showAdLabel = true,
  children,
  triggerText = "Show Ad",
  triggerProps = {},
  onAdClick,
  asChild = false,
  onClose,
  onOpen,
  hideTrigger = false,
  fallbackToAppWall = true,
  preferAdType,
  forBoost,
  surface,
  onUnavailable,
}: PartnerAdDialogProps) {
  const { width } = useWindowDimensions();

  // ── Ad resolution ────────────────────────────────────────────────────────────
  const { ad, adType, isLoading, refetchAd, cycleAdType } = usePartnerAd({
    forBoost,
    forceType: preferAdType,
  });
  const { trackImpression, trackClick, trackVideo } = usePartnerEvents();
  const reportSurface = resolveAdSurface(ad ?? {}, surface, REQUESTED_SURFACES);

  // ── Dialog open state ────────────────────────────────────────────────────────
  const [internalOpen, setInternalOpen] = useState(false);
  /**
   * The rotation asked for a Google ad, but none was loaded, so the partner ad
   * is shown instead. Kept as state rather than derived so the dialog keeps
   * showing it for the whole watch even if the Google ad finishes loading.
   */
  const [fallbackToPartner, setFallbackToPartner] = useState(false);
  const showingPartner = adType === "custom" || fallbackToPartner;
  // True until the partner video reports otherwise, so non-video ads and the
  // Google path keep counting.
  const [partnerVideoPlaying, setPartnerVideoPlaying] = useState(true);

  /**
   * Whether there is actually something to render.
   *
   * The trigger path checks this inside `handleOpenChange` before opening. An
   * external `open` never goes through that path, so a caller that sets it
   * while the rotation is on a Google ad (or before any partner item has
   * loaded), used to get a modal with nothing in it. The check lives here,
   * where both paths meet.
   */
  const showable = showingPartner && Boolean(ad);
  const isOpen = (externalOpen ?? internalOpen) && showable;
  const setIsOpen = externalSetOpen ?? setInternalOpen;

  // Served, not watched: same one-second dwell the app-open ad uses. The
  // cleanup cancels it when the dialog closes first.
  const adId = ad?.id;
  useEffect(() => {
    if (!(isOpen && adId)) {
      return;
    }
    const timer = setTimeout(
      () => trackImpression(adId, reportSurface),
      AD_IMPRESSION_DWELL_MS
    );
    return () => clearTimeout(timer);
  }, [isOpen, adId, reportSurface, trackImpression]);

  /**
   * The completed ad is handed to the caller, not just the fact of completion.
   *
   * A giveaway Boost is recorded against the specific partner item watched.
   * Three boosts means three different items, and the engine refuses a repeat,
   * so a caller that only learns "an ad finished" has nothing to record.
   * A Google ad has no partner-content record, so it reports `undefined` and
   * the caller decides what that is worth.
   */
  const { countdown, reset: resetCountdown } = useAdCountdown({
    duration: countdownDuration,
    // Pausing the creative pauses the reward clock with it.
    enabled: isOpen && showingPartner && partnerVideoPlaying,
    onComplete: () => onCountdownComplete?.(ad),
  });

  // ── Google ad ────────────────────────────────────────────────────────────────

  /**
   * On the Boost surface, a Google reward is worth a Boost — but only once
   * Google has told our server so itself.
   *
   * `forBoost` is already the flag meaning "this is the surface where an
   * advertisement earns giveaway credit", so it governs this too rather than
   * introducing a second way to say the same thing. Off it, the options stay
   * undefined and Google sends no callback: a reward earned on the giveaway
   * reveal is suspense, not eligibility, and must not arrive at the endpoint
   * indistinguishable from a Boost.
   *
   * The giveaway is deliberately not named here. These are baked into the ad
   * request at load time, which can be long before the ad is watched, so the
   * server resolves which giveaway is open when the callback lands instead.
   */
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  const serverSideVerification = useMemo(() => {
    if (!(forBoost && userId)) {
      return;
    }
    return {
      userId: String(userId),
      customData: JSON.stringify({ purpose: "boost" }),
    };
  }, [forBoost, userId]);

  const googleAd = useGoogleAd({
    onRewarded: () => onCountdownComplete?.(undefined),
    onClosed: cycleAdType,
    serverSideVerification,
  });

  // ── YouTube state (kept here so it resets with dialog) ───────────────────────
  const [ytPlaying, setYtPlaying] = useState(false);
  const onYtStateChange = useCallback((state: string) => {
    if (state === "ended") {
      setYtPlaying(false);
    }
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  /** Always call this after the dialog has been confirmed to close. */
  const handleDidClose = useCallback(() => {
    setIsOpen(false);
    resetCountdown();
    setPartnerVideoPlaying(true);
    refetchAd();
    cycleAdType();
    setFallbackToPartner(false);
    onClose?.();
  }, [
    setIsOpen,
    resetCountdown,
    refetchAd,
    cycleAdType,
    onClose,
    setFallbackToPartner,
  ]);

  /**
   * Hand control straight back when opened from outside with nothing to show.
   *
   * A caller that sets `open` is waiting on `onClose` to know the ad is done.
   * Without this it would wait forever on a dialog that is never going to
   * appear. Waits out `isLoading` first, so a slow fetch is not mistaken for
   * an empty one, and fires once per open so `refetchAd` cannot re-trigger it.
   */
  const handedBack = useRef(false);
  useEffect(() => {
    if (!externalOpen) {
      handedBack.current = false;
      return;
    }
    if (showable || isLoading || handedBack.current) {
      return;
    }
    handedBack.current = true;
    handleDidClose();
  }, [externalOpen, showable, isLoading, handleDidClose]);

  const handleClose = useCallback(() => {
    if (showingPartner && countdown > 0) {
      Alert.alert(
        "Close Advertisement",
        "You will lose the chance to earn points",
        [
          { text: "Close Ad", style: "cancel", onPress: handleDidClose },
          { text: "RESUME", onPress: () => {} },
        ],
        { cancelable: false }
      );
      return;
    }
    handleDidClose();
  }, [showingPartner, countdown, handleDidClose]);

  // Handles open/close transitions. The `open === true` branch is the single
  // entry point for user-initiated opens (whether from Dialog.Trigger, external
  // `setOpen(true)`, or any other path), so it owns gate checks, native-ad
  // dispatch, and the LuckyAppWall fallback.
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleClose();
        return;
      }

      // Gate: caller can refuse to open (e.g. redirect to LuckyAppWall or auth).
      if (onOpen?.() === false) {
        return;
      }

      // Native ad path → show Google if it is ready, otherwise fall back to a
      // partner ad, and only then to the LuckyAppWall.
      if (adType === "native") {
        if (googleAd.isLoaded) {
          googleAd.show();
          return;
        }
        // Still fetching is not "nothing to show": wait rather than navigate
        // away from the screen the person just chose.
        if (isLoading) {
          return;
        }
        if (ad) {
          /**
           * The Google ad is not loaded, which on Android is the normal state
           * straight after the previous one. Bouncing to the app wall here is
           * what made only the first Connect Brands open of a session pay;
           * the partner ad already fetched for the rotation can pay instead.
           */
          setFallbackToPartner(true);
          setIsOpen(true);
          return;
        }
        onUnavailable?.();
        if (fallbackToAppWall) {
          navigate("LuckyAppWall");
        }
        return;
      }

      /**
       * Still fetching is not the same as nothing to show.
       *
       * This used to treat both as "no ad" and send the person to the Lucky
       * App Wall, so tapping before the query settled navigated them away from
       * the screen they had just chosen. Doing nothing for the moment it takes
       * to load is a far smaller cost than moving them somewhere else.
       */
      if (isLoading) {
        return;
      }

      // Genuinely nothing to show → tell the caller, then fall back.
      if (!ad) {
        onUnavailable?.();
        if (fallbackToAppWall) {
          navigate("LuckyAppWall");
        }
        return;
      }

      setIsOpen(true);
    },
    [
      onOpen,
      adType,
      googleAd,
      ad,
      isLoading,
      fallbackToAppWall,
      onUnavailable,
      setIsOpen,
      setFallbackToPartner,
      handleClose,
    ]
  );

  const handleAdClick = useCallback(async () => {
    if (onAdClick) {
      onAdClick(ad);
      return;
    }

    /*
     * The store link is preferred where there is one, falling back to the
     * campaign's landing page. Only a store link is handed to the OS: an
     * `https://` website through `Linking.openURL` leaves the app for Safari
     * or Chrome, which drops the viewer out of the ad flow entirely.
     */
    const link = resolvePartnerLink(
      ad?.links,
      Platform.OS === "android" ? "android" : "ios"
    );

    if (link && ad) {
      // Analytics only: this is not the CPA path and writes no conversion.
      trackClick(ad.id, reportSurface);
    }

    /*
     * The ad ends with the tap. Leaving the dialog open while the in-app
     * browser is pushed put a full-window overlay above the page, and leaving
     * it open for an external hand-off left it to rotate and stall the
     * countdown on return. Closing first also stops the audio.
     */
    if (link) {
      handleDidClose();
    }

    /*
     * Not a bare `Linking.openURL`: some Android phones refuse a
     * play.google.com link ("Permission Denial") and the tap then does
     * nothing, on a click that earns money. `openStoreLink` retries through
     * the store's own scheme, and the in-app page is the last resort.
     */
    if (link && !(link.isStore && (await openStoreLink(link.url)))) {
      navigate("InAppBrowser", {
        url: link.url,
        title: ad?.title ?? "",
        confirmOnLeave: false,
      });
    }
  }, [onAdClick, ad, reportSurface, trackClick, handleDidClose]);

  const handleTriggerPress = useCallback(() => {
    handleOpenChange(true);
  }, [handleOpenChange]);

  useGlobalBackHandler(() => {
    if (isOpen) {
      handleClose();
      return true;
    }

    return false;
  });

  // ── Trigger element ───────────────────────────────────────────────────────────

  const renderTrigger = () => {
    if (hideTrigger || externalOpen) {
      return null;
    }

    if (asChild && children) {
      return <Dialog.Trigger asChild>{children}</Dialog.Trigger>;
    }

    if (children) {
      return (
        <Text
          className="cursor-pointer"
          onPress={handleTriggerPress}
          {...(triggerProps as React.ComponentProps<typeof Text>)}
        >
          {children}
        </Text>
      );
    }

    return (
      <Button onPress={handleTriggerPress} {...triggerProps}>
        <Button.Label>{triggerText}</Button.Label>
      </Button>
    );
  };

  // ── Dialog content ────────────────────────────────────────────────────────────
  const dialogContent =
    showingPartner && ad ? (
      <PartnerAdContent
        ad={ad}
        onAdClick={handleAdClick}
        onPlaybackChange={setPartnerVideoPlaying}
        onVideoEvent={(event) => {
          if (ad) {
            trackVideo(ad.id, event, reportSurface);
          }
        }}
        onYtStateChange={onYtStateChange}
        showAdLabel={showAdLabel}
        ytPlaying={ytPlaying}
      />
    ) : null;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <Dialog isOpen={isOpen} onOpenChange={handleOpenChange}>
      {renderTrigger()}

      <Dialog.Portal className="justify-start p-0">
        <Dialog.Overlay className="bg-black/50" isCloseOnPress={false} />
        <Dialog.Content
          isSwipeable={countdown <= 0}
          style={{ width: "100%", height: "100%" }}
        >
          {/* Close / countdown button */}
          <View className="z-10 mt-safe-offset-0 flex-row items-center self-end rounded-full bg-[#f5f5f5] px-2">
            {showingPartner && countdown > 0 ? (
              <Text className="mr-1 text-sm">{`Reward in ${countdown} seconds`}</Text>
            ) : null}
            <PressableFeedback
              className="rounded-full bg-white p-2"
              onPress={handleClose}
            >
              <XIcon color="black" size={16} />
            </PressableFeedback>
          </View>

          {dialogContent}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

export default PartnerAdDialog;
