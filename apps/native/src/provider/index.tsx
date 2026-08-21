import { ErrorBoundary } from "@sentry/react-native";
import { DetourProvider } from "@swmansion/react-native-detour";
import type { HeroUINativeConfig } from "heroui-native/provider";
import { HeroUINativeProvider } from "heroui-native/provider";
import { IconContext } from "phosphor-react-native";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  KeyboardAvoidingView,
  KeyboardProvider,
} from "react-native-keyboard-controller";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { ToastBridge } from "#/components/heroui/toast";
import OfflineAlert from "#/components/OfflineAlert";
import { useListeningTimeSync } from "#/hooks/discover/useListeningTime";
import { useOnlineManager } from "#/hooks/useOnlineManager";
import usePushNotification from "#/hooks/usePushNotification";
import { detourConfig } from "#/lib/detour";
import { newsAnalyticsClient } from "#/lib/newsAnalyticsClient";
import { useUpdates } from "#/lib/UpdatesProvider";
import { authState } from "#/state/auth";
import { useAfterStartup } from "#/utils/afterStartup";
import { scheduleDailyDigest } from "#/widgets";

type Props = {
  children: React.ReactNode;
};

const toastContentWrapper = (children: React.ReactNode) => (
  <KeyboardAvoidingView
    behavior="padding"
    className="flex-1"
    keyboardVerticalOffset={12}
    pointerEvents="box-none"
  >
    {children}
  </KeyboardAvoidingView>
);

const config: HeroUINativeConfig = {
  textProps: {
    allowFontScaling: true,
    maxFontSizeMultiplier: 1.2,
    minimumFontScale: 0.5,
  },
  devInfo: {
    stylingPrinciples: false,
  },
  toast: {
    insets: { left: 16, right: 16 },
    contentWrapper: toastContentWrapper,
  },
};

export const Provider = ({ children }: Props) => {
  useListeningTimeSync();
  usePushNotification();
  // Without this React Query believes it is online forever, and offline
  // queries fail through the full retry ladder instead of pausing.
  useOnlineManager();
  const { updateSheet } = useUpdates();

  // Neither of the effects below is needed for the first screen, and both are
  // expensive in the way that matters at startup: the analytics client starts
  // a poller, and the digest fetches news over the network and renders widget
  // timelines. Held until the first frames are done.
  const startupSettled = useAfterStartup();

  useEffect(() => {
    if (!startupSettled) {
      return;
    }
    newsAnalyticsClient.start(() => authState.user?.id);
    return () => newsAnalyticsClient.stop();
  }, [startupSettled]);

  useEffect(() => {
    if (!startupSettled) {
      return;
    }
    scheduleDailyDigest();
  }, [startupSettled]);

  return (
    <DetourProvider config={detourConfig}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <KeyboardProvider>
            <HeroUINativeProvider config={config}>
              <ErrorBoundary>
                <IconContext.Provider
                  value={{
                    weight: "bold",
                    // color: "#eee",
                  }}
                >
                  {children}
                  {updateSheet}
                </IconContext.Provider>
              </ErrorBoundary>
              <ToastBridge />
              <OfflineAlert />
            </HeroUINativeProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </DetourProvider>
  );
};
