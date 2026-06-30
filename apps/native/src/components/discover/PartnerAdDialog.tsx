import { Dialog, PressableFeedback } from "heroui-native";
import { XIcon } from "phosphor-react-native";
import { type ReactNode, useCallback, useState } from "react";
import { Alert, Linking, Platform, useWindowDimensions, View } from "react-native";

import { Button } from "#/components/heroui/button";
import { Text } from "#/components/heroui/text";
import { useAdCountdown } from "#/hooks/discover/useAdCountdown";
import { useGoogleAd } from "#/hooks/discover/useGoogleAd";
import { usePartnerAd } from "#/hooks/discover/usePartnerAd";
import { useGlobalBackHandler } from "#/hooks/useBackHandler";
import { navigate } from "#/navigation/navigationUtils";

import { PartnerAdContent } from "./partner-ad-content";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PartnerAdDialogProps = {
  open?: boolean;
  setOpen?: (open: boolean) => void;
  onCountdownComplete?: () => void;
  countdownDuration?: number;
  showAdLabel?: boolean;
  children?: ReactNode;
  triggerText?: string;
  triggerProps?: React.ComponentProps<typeof Button>;
  asChild?: boolean;
  onAdClick?: (ad: unknown) => void;
  onClose?: () => void;
  onOpen?: () => void | boolean;
  /** When true, hides the trigger button (useful when controlled externally) */
  hideTrigger?: boolean;
  /** When false, doesn't navigate to LuckyAppWall when ads unavailable (default: true) */
  fallbackToAppWall?: boolean;
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
}: PartnerAdDialogProps) {
  const { width } = useWindowDimensions();

  // ── Dialog open state ────────────────────────────────────────────────────────
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = externalOpen ?? internalOpen;
  const setIsOpen = externalSetOpen ?? setInternalOpen;

  // ── Ad resolution ────────────────────────────────────────────────────────────
  const { ad, adType, refetchAd, cycleAdType } = usePartnerAd();

  // ── Countdown (only active for custom ads while dialog is open) ──────────────
  const { countdown, reset: resetCountdown } = useAdCountdown({
    duration: countdownDuration,
    enabled: isOpen && adType === "custom",
    onComplete: onCountdownComplete,
  });

  // ── Google ad ────────────────────────────────────────────────────────────────
  const googleAd = useGoogleAd({
    onRewarded: onCountdownComplete,
    onClosed: cycleAdType,
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
    refetchAd();
    cycleAdType();
    onClose?.();
  }, [setIsOpen, resetCountdown, refetchAd, cycleAdType, onClose]);

  const handleClose = useCallback(() => {
    if (adType === "custom" && countdown > 0) {
      Alert.alert(
        "Close Advertisement",
        "You will lose the chance to earn points",
        [
          { text: "Close Ad", style: "cancel", onPress: handleDidClose },
          { text: "RESUME", onPress: () => {} },
        ],
        { cancelable: false },
      );
      return;
    }
    handleDidClose();
  }, [adType, countdown, handleDidClose]);

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

      // Native ad path → show Google ad or fall back to LuckyAppWall.
      if (adType === "native") {
        if (googleAd.isLoaded) {
          googleAd.show();
        } else if (fallbackToAppWall) {
          navigate("LuckyAppWall");
        }
        return;
      }

      // No ad available yet → LuckyAppWall fallback.
      if (!ad) {
        if (fallbackToAppWall) {
          navigate("LuckyAppWall");
        }
        return;
      }

      setIsOpen(true);
    },
    [onOpen, adType, googleAd, ad, fallbackToAppWall, setIsOpen, handleClose],
  );

  const handleAdClick = useCallback(() => {
    if (onAdClick) {
      onAdClick(ad);
      return;
    }
    const link =
      Platform.select({
        ios: ad?.links?.iosAppStore,
        android: ad?.links?.androidPlayStore,
      }) ?? ad?.links?.website;

    if (link) {
      Linking.openURL(link);
    }
  }, [onAdClick, ad]);

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
    adType === "custom" && ad ? (
      <PartnerAdContent
        ad={ad}
        onAdClick={handleAdClick}
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
        <Dialog.Content isSwipeable={countdown <= 0} style={{ width: "100%", height: "100%" }}>
          {/* Close / countdown button */}
          <View className="z-10 mt-safe-offset-0 flex-row items-center self-end rounded-full bg-[#f5f5f5] px-2">
            {adType === "custom" && countdown > 0 ? (
              <Text className="mr-1 text-sm">{`Reward in ${countdown} seconds`}</Text>
            ) : null}
            <PressableFeedback className="rounded-full bg-white p-2" onPress={handleClose}>
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
