import type { PartnerContent } from "@news-spend-media/payload/types";
import { CaretRightIcon } from "phosphor-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { NativeAd, TestIds } from "react-native-google-mobile-ads";
import { Sheet } from "tamagui";
import { useSnapshot } from "valtio";

import { Button } from "#/components/ui/Button";
import { type AdPlacement, consumeAd } from "#/state/adManager";
import { appOpenAdSheetState, setAdType, setNativeAdReady } from "#/state/appOpenAdState";

import CustomNewsOpenAd from "./CustomNewsOpenAd";
import NativeNewsOpenAd from "./NativeNewsOpenAd";

const AppOpenAd = () => {
  const { isOpen, adType, placement } = useSnapshot(appOpenAdSheetState);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nativeAd, setNativeAd] = useState<NativeAd | undefined>();
  const [customAd, setCustomAd] = useState<PartnerContent | null>(null);

  const consumedPlacementRef = useRef<AdPlacement | null>(null);

  useEffect(() => {
    if (isOpen && consumedPlacementRef.current !== placement) {
      consumedPlacementRef.current = placement;
      setCustomAd(consumeAd(placement));
    }
    if (!isOpen) {
      consumedPlacementRef.current = null;
      setCustomAd(null);
    }
  }, [isOpen, placement]);

  const loadAd = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const ad = await NativeAd.createForAdRequest(TestIds.GAM_NATIVE_VIDEO, {});
      setNativeAd(ad);
      setNativeAdReady(true);
    } catch {
      setError(true);
      setNativeAdReady(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen && adType === "native") {
      setNativeAdReady(false);
      loadAd();
      setAdType();
    }
  }, [isOpen, adType, loadAd]);

  useEffect(() => {
    const onBackPress = () => {
      if (isOpen) {
        appOpenAdSheetState.close();
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [isOpen]);

  const onPress = useCallback(() => {
    appOpenAdSheetState.close();
  }, []);

  const renderAd = () => {
    if (!isOpen) {
      return null;
    }
    if (adType === "custom") {
      if (customAd) {
        return <CustomNewsOpenAd ad={customAd} />;
      }
      if (nativeAd) {
        return <NativeNewsOpenAd error={error} loading={loading} nativeAd={nativeAd} />;
      }
    } else if (adType === "native") {
      if (nativeAd) {
        return <NativeNewsOpenAd error={error} loading={loading} nativeAd={nativeAd} />;
      }
      if (customAd) {
        return <CustomNewsOpenAd ad={customAd} />;
      }
    }
    return null;
  };

  return (
    <Sheet
      animation="fast"
      disableDrag
      dismissOnOverlayPress={false}
      forceRemoveScrollEnabled={isOpen}
      modal
      open={isOpen}
      position={0}
      snapPoints={[90]}
      zIndex={100_000}
    >
      {/* <Sheet.Overlay bg="rgba(0,0,0,0.5)" /> */}
      {/* <Sheet.Handle /> */}
      <Sheet.Frame bg="transparent" flex={1} gap="$5">
        <Button
          als="flex-end"
          bg="$background"
          borderRadius="$6"
          jc="space-between"
          onPress={onPress}
          // py={15}
          pressStyle={{
            zIndex: "$4",
            backgroundColor: "#f5f5f5",
          }}
          w="80%"
          zi="$3"
        >
          <Button.Text color="$color">Continue </Button.Text>
          <Button.Icon color="black">
            <CaretRightIcon />
          </Button.Icon>
        </Button>
        {renderAd()}
      </Sheet.Frame>
    </Sheet>
  );
};

export default AppOpenAd;
