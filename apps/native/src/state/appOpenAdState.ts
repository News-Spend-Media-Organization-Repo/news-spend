import { proxy, subscribe } from "valtio";

type AppOpenAdSheetState = {
  isOpen: boolean;
  customAdReady?: boolean;
  nativeAdReady?: boolean;
  adType: "custom" | "native";
  onCloseCallback?: undefined | (() => void);
  open: (onCloseCallback?: () => void) => void;
  close: () => void;
};

export const appOpenAdSheetState = proxy<AppOpenAdSheetState>({
  isOpen: false,
  onCloseCallback: undefined,
  customAdReady: false,
  nativeAdReady: false,
  adType: Math.random() < 0.4 ? "custom" : "native", // Randomly choose ad type for demonstration
  open: (onCloseCallback) => {
    appOpenAdSheetState.isOpen = true;
    appOpenAdSheetState.onCloseCallback = onCloseCallback;
  },
  close: () => {
    appOpenAdSheetState.isOpen = false;
    appOpenAdSheetState.onCloseCallback?.();
    appOpenAdSheetState.onCloseCallback = undefined;
  },
});

subscribe(appOpenAdSheetState, () =>
  console.log("state has changed to", appOpenAdSheetState)
);

export const setAdType = () => {
  const rand = Math.random();

  console.log("Setting ad type, random value:", rand);
  appOpenAdSheetState.adType = rand < 0.4 ? "custom" : "native";
};

export const setCustomAdReady = (ready: boolean) => {
  appOpenAdSheetState.customAdReady = ready;
};

export const setNativeAdReady = (ready: boolean) => {
  appOpenAdSheetState.nativeAdReady = ready;
};
