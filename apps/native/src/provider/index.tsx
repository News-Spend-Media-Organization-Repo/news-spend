import { ErrorBoundary } from "@sentry/react-native";
import { DetourProvider } from "@swmansion/react-native-detour";
import { type HeroUINativeConfig, HeroUINativeProvider } from "heroui-native";
import { IconContext } from "phosphor-react-native";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  KeyboardAvoidingView,
  KeyboardProvider,
} from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastBridge } from "#/components/heroui/toast";
import { useListeningTimeSync } from "#/hooks/discover/useListeningTime";
import usePushNotification from "#/hooks/usePushNotification";
import { detourConfig } from "#/lib/detour";
import { newsAnalyticsClient } from "#/lib/newsAnalyticsClient";
import { useUpdates } from "#/lib/UpdatesProvider";
import { authState } from "#/state/auth";
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
  const { UpdateModalComponent } = useUpdates();

  useEffect(() => {
    newsAnalyticsClient.start(() => authState.user?.id);
    return () => newsAnalyticsClient.stop();
  }, []);

  useEffect(() => {
    scheduleDailyDigest();
  }, []);

  return (
    <DetourProvider config={detourConfig}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
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
                  <UpdateModalComponent />
                </IconContext.Provider>
              </ErrorBoundary>
              <ToastBridge />
            </HeroUINativeProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </DetourProvider>
  );
};
