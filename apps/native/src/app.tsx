import "./global.css";
import "react-native-url-polyfill/auto";
import { DefaultTheme, type Theme } from "@react-navigation/native";
import { useMMKVDevTools } from "@rozenite/mmkv-plugin";
import { useReactNavigationDevTools } from "@rozenite/react-navigation-plugin";
import { useTanStackQueryDevTools } from "@rozenite/tanstack-query-plugin";
import * as Sentry from "@sentry/react-native";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { AppMetrics, Observe, ObserveRoot } from "expo-observe";
import { ObserveNavigationProvider } from "expo-observe/integrations/react-navigation";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef } from "react";
import { Uniwind } from "uniwind";
import { useSnapshot } from "valtio";
import AppOpenAd from "./components/Ads/AppOpenAd";
import GiveawayReward from "./components/dialogs/GiveawayReward";
import LotteryReward from "./components/dialogs/LotteryReward";
import useCachedResources from "./hooks/useCachedResources";
import { initializeAdsWhenPermitted } from "./lib/adsInit";
import { initSentry } from "./lib/sentry";
import { queryClient } from "./lib/tanstackQuery";
import { Navigation } from "./navigation";
import { CONSTANTS } from "./navigation/constants";
import { linking } from "./navigation/linking";
import {
  navigationRef,
  useNavigationPersistence,
} from "./navigation/navigationUtils";
import { Provider } from "./provider";
import { authState, hydrateAuth } from "./state/auth";
import { createMMKVPersister } from "./utils/clientPersister";
import { storage } from "./utils/storage";
import { UpgradeRequired } from "#/components/UpgradeRequired";

Uniwind.setTheme("light");

SplashScreen.preventAutoHideAsync();

SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

initSentry();
hydrateAuth();

const persister = createMMKVPersister();

Observe.configure({
  integrations: {
    "react-navigation": true,
  },
});

const myCustomTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#fff",
    card: "#00223D",
  },
};
export function App() {
  useTanStackQueryDevTools(queryClient);
  useReactNavigationDevTools({ ref: navigationRef });
  useMMKVDevTools({
    storages: {
      "main-storage": storage,
    },
  });
  const { onNavigationStateChange, onReady } = useNavigationPersistence(
    storage,
    CONSTANTS.PERSISTENCE_KEY
  );

  const { loadingComplete } = useCachedResources();

  const authStatus = useSnapshot(authState).status;

  // Request App Tracking Transparency (iOS) and only then initialize the
  // Mobile Ads SDK + preload ads, so no tracking data is collected before
  // the user has had a chance to consent.
  const adsInitiatedRef = useRef(false);

  useEffect(() => {
    if (adsInitiatedRef.current) {
      return;
    }
    adsInitiatedRef.current = true;
    initializeAdsWhenPermitted().catch((error) => {
      console.warn("Ad initialization failed", error);
    });
  }, []);

  const hideSplash = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (authStatus !== "idle" && loadingComplete) {
      hideSplash();
      AppMetrics.markInteractive();
    }
  }, [hideSplash, authStatus, loadingComplete]);

  if (authStatus === "idle" || !loadingComplete) {
    return null;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <Provider>
        <ObserveNavigationProvider navigationRef={navigationRef}>
          <Navigation
            linking={linking}
            onReady={onReady}
            onStateChange={onNavigationStateChange}
            persistor={{
              persist(state) {
                const isDev = __DEV__;
                if (isDev) {
                  storage.set(CONSTANTS.PERSISTENCE_KEY, JSON.stringify(state));
                }
              },
              restore() {
                const state = storage.getString(CONSTANTS.PERSISTENCE_KEY);

                return state ? JSON.parse(state) : undefined;
              },
            }}
            ref={navigationRef}
            theme={myCustomTheme}
          />
        </ObserveNavigationProvider>
        <LotteryReward />
        <GiveawayReward />
        {/* Last, so it covers everything when the server refuses this build. */}
        <UpgradeRequired />

        <AppOpenAd />
      </Provider>
    </PersistQueryClientProvider>
  );
}

const ObservedApp = ObserveRoot.wrap(App);
const RootComponent = __DEV__ ? ObservedApp : Sentry.wrap(ObservedApp);

export default RootComponent;
