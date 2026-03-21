import { useQuery } from "@tanstack/react-query";
import { CaretRightIcon } from "phosphor-react-native";
import { useCallback, useEffect, useId, useState } from "react";
import { BackHandler } from "react-native";
import { NativeAd, TestIds } from "react-native-google-mobile-ads";
import { Sheet } from "tamagui";
import { useSnapshot } from "valtio";

import { Button } from "#/components/ui/Button";
import { orpc } from "#/lib/orpc";
import {
  appOpenAdSheetState,
  setAdType,
  setCustomAdReady,
  setNativeAdReady,
} from "#/state/appOpenAdState";

import CustomNewsOpenAd from "./CustomNewsOpenAd";
import NativeNewsOpenAd from "./NativeNewsOpenAd";

const AppOpenAd = () => {
  const { isOpen, adType } = useSnapshot(appOpenAdSheetState);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nativeAd, setNativeAd] = useState<NativeAd | undefined>();

  const id = useId();
  const queryOptions = orpc.partnerContent.getOne.queryOptions({
    input: {
      // placement: ["news-click-ads"],
      type: ["video"],
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
  const queryKey = [...queryOptions.queryKey, id];
  const partnerContentQuery = useQuery({
    ...queryOptions,
    queryKey,
  });

  useEffect(() => {
    if (
      !partnerContentQuery.isFetching &&
      partnerContentQuery.data &&
      !partnerContentQuery.isError
    ) {
      setCustomAdReady(true);
    }
  }, [
    partnerContentQuery.isFetching,
    partnerContentQuery.data,
    partnerContentQuery.isError,
  ]);

  const loadAd = useCallback(async () => {
    setLoading(true);
    setLoaded(false);
    setError(false);
    try {
      const ad = await NativeAd.createForAdRequest(
        TestIds.GAM_NATIVE_VIDEO,
        {}
      );
      setNativeAd(ad);
      setNativeAdReady(true);
    } catch (err) {
      console.error("Error loading native ad:", err);
      setError(true);
      setNativeAdReady(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // check the previous ad type and reset accordingly
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

        if (adType === "custom") {
          setCustomAdReady(false);
          partnerContentQuery.refetch();
        }
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );
    return () => subscription.remove();
  }, [isOpen]);

  const onPress = useCallback(() => {
    appOpenAdSheetState.close();
    if (adType === "custom") {
      setCustomAdReady(false);
      partnerContentQuery.refetch();
    } else {
      // setNativeAdReady(false);
      // loadAd();
    }
  }, []);

  const renderAd = () => {
    if (!isOpen) {
      return null;
    }
    if (adType === "custom") {
      if (partnerContentQuery.data && !partnerContentQuery.isError) {
        return <CustomNewsOpenAd ad={partnerContentQuery.data} />;
      }
      if (nativeAd) {
        return (
          <NativeNewsOpenAd
            error={error}
            loading={loading}
            nativeAd={nativeAd}
          />
        );
      }
    } else if (adType === "native") {
      if (nativeAd) {
        return (
          <NativeNewsOpenAd
            error={error}
            loading={loading}
            nativeAd={nativeAd}
          />
        );
      }
      if (partnerContentQuery.data && !partnerContentQuery.isError) {
        return <CustomNewsOpenAd ad={partnerContentQuery.data} />;
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
