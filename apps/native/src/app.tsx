import "./global.css";
import "react-native-url-polyfill/auto";
import { useMMKVDevTools } from "@rozenite/mmkv-plugin";
import { useReactNavigationDevTools } from "@rozenite/react-navigation-plugin";
import { useTanStackQueryDevTools } from "@rozenite/tanstack-query-plugin";
import * as Sentry from "@sentry/react-native";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect } from "react";
import mobileAds from "react-native-google-mobile-ads";
import { Uniwind } from "uniwind";
import { useSnapshot } from "valtio";
import LotteryReward from "./components/dialogs/LotteryReward";
import useCachedResources from "./hooks/useCachedResources";
import { initSentry } from "./lib/sentry";
import { queryClient } from "./lib/tanstackQuery";
import { Navigation } from "./navigation";
import { CONSTANTS } from "./navigation/constants";
import { linking } from "./navigation/linking";
import { navigationRef, useNavigationPersistence } from "./navigation/navigationUtils";
import { Provider } from "./provider";
import { preloadAds } from "./state/adManager";
import { authState, hydrateAuth } from "./state/auth";
import { createMMKVPersister } from "./utils/clientPersister";
import { storage } from "./utils/storage";

Uniwind.setTheme("light");

SplashScreen.preventAutoHideAsync();

SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

mobileAds()
  .initialize()
  .then((_adapterStatuses) => {
    // Initialization complete!
  });

initSentry();
hydrateAuth();
preloadAds(["news-click-ads", "discover-tab"]);

const persister = createMMKVPersister();
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
    CONSTANTS.PERSISTENCE_KEY,
  );

  const { loadingComplete } = useCachedResources();

  const authStatus = useSnapshot(authState).status;

  const hideSplash = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (authStatus !== "idle" && loadingComplete) {
      hideSplash();
    }
  }, [hideSplash, authStatus, loadingComplete]);

  if (authStatus === "idle" || !loadingComplete) {
    return null;
  }

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <Provider>
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
        />
        <LotteryReward />

        {/*<AppOpenAd />*/}
      </Provider>
    </PersistQueryClientProvider>
  );
}
const RootComponent = __DEV__ ? App : Sentry.wrap(App);

export default RootComponent;
