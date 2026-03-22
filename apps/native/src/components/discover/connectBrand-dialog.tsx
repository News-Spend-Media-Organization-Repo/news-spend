import { Slot } from "@radix-ui/react-slot";
import { useNavigation } from "@react-navigation/native";
import { X } from "@tamagui/lucide-icons";
import { type ReactNode, useCallback, useState } from "react";
import { Alert, Linking, Platform, useWindowDimensions } from "react-native";
import { AlertDialog, Circle, Text } from "tamagui";

import { Button } from "#/components/ui";
import { useAdCountdown } from "#/hooks/discover/useAdCountdown";
import { useGoogleAd } from "#/hooks/discover/useGoogleAd";
import { usePartnerAd } from "#/hooks/discover/usePartnerAd";
import { useGlobalBackHandler } from "#/hooks/useBackHandler";
import { navigate } from "#/navigation/navigationUtils";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

import { Screen } from "../Screen";
import { PartnerAdContent } from "./partner-ad-content";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectBrandDialogProps = {
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
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ConnectBrandDialog({
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
}: ConnectBrandDialogProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsetsStyle(["bottom", "top"]);

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
    if (state === "ended") setYtPlaying(false);
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
        { cancelable: false }
      );
      return;
    }
    handleDidClose();
  }, [adType, countdown, handleDidClose]);

  // Handles external close triggers (e.g. Android back, overlay tap via Tamagui).
  // Only acts on close (open=false) since we control open ourselves via handleTriggerPress.
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) handleClose();
    },
    [handleClose]
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

    if (link) Linking.openURL(link);
  }, [onAdClick, ad]);

  const handleTriggerPress = useCallback(() => {
    if (onOpen?.() === false) return;

    if (adType === "native") {
      if (googleAd.isLoaded) {
        googleAd.show();
      } else {
        navigate("LuckyAppWall");
      }
      return;
    }

    // custom
    if (!ad) {
      navigate("LuckyAppWall");
      return;
    }
    setIsOpen(true);
  }, [onOpen, adType, googleAd, ad, setIsOpen]);

  useGlobalBackHandler(() => {
    if (isOpen) {
      handleClose();
      return true;
    }
    return false;
  });

  // ── Trigger element ───────────────────────────────────────────────────────────
  const TriggerElement = asChild ? Slot : Text;

  const trigger = externalOpen ? null : children ? (
    <TriggerElement
      onPress={handleTriggerPress}
      {...triggerProps}
      style={{ cursor: "pointer" }}
    >
      {children}
    </TriggerElement>
  ) : (
    <Button onPress={handleTriggerPress} {...triggerProps}>
      <Button.Text>{triggerText}</Button.Text>
    </Button>
  );

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
    <>
      {trigger}

      <AlertDialog onOpenChange={handleOpenChange} open={isOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            animation="quick"
            bg="rgba(0,0,0,0.5)"
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
            key="overlay"
            onPress={handleClose}
            opacity={0.8}
          />
          <AlertDialog.Content
            animation={["quick", { opacity: { overshootClamping: true } }]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            fullscreen
            key="connectBrand-ad"
            opacity={1}
            p="$0"
            scale={1}
            x={0}
            y={0}
          >
            <Screen
              bg="transparent"
              contentContainerStyle={insets}
              flex={1}
              gap="$5"
            >
              {/* Close / countdown button */}
              <Button
                als="flex-end"
                bg="#f5f5f5"
                borderRadius="$6"
                br="$10"
                h="auto"
                jc="space-between"
                mr="$2"
                mt="$2"
                onPress={handleClose}
                p="$2"
                pressStyle={{ zIndex: "$4" }}
                zi="$3"
              >
                {adType === "custom" && countdown > 0 ? (
                  <Button.Text color="$color" fontSize="$3">
                    {`Reward in ${countdown} seconds`}
                  </Button.Text>
                ) : null}
                <Button.Icon color="black">
                  <Circle bg="white" br="$5" p="$2">
                    <X size="$1" />
                  </Circle>
                </Button.Icon>
              </Button>

              {dialogContent}
            </Screen>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog>
    </>
  );
}

export default ConnectBrandDialog;
