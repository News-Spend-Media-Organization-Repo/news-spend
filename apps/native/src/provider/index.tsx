import { ErrorBoundary } from "@sentry/react-native";
import { DetourProvider } from "@swmansion/react-native-detour";
import { HeroUINativeProvider } from "heroui-native";
import { IconContext } from "phosphor-react-native";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { PortalProvider, TamaguiProvider } from "tamagui";
import { DetourDeepLinkHandler } from "#/components/DetourDeepLinkHandler";
import { useListeningTimeSync } from "#/hooks/discover/useListeningTime";
import usePushNotification from "#/hooks/usePushNotification";
import { detourConfig } from "#/lib/detour";
import { newsAnalyticsClient } from "#/lib/newsAnalyticsClient";
import { authState } from "#/state/auth";
import config from "#/tamagui.config";

type Props = {
  children: React.ReactNode;
};

export const Provider = ({ children }: Props) => {
  useListeningTimeSync();
  usePushNotification();

  useEffect(() => {
    newsAnalyticsClient.start(() => authState.user?.id);
    return () => newsAnalyticsClient.stop();
  }, []);

  return (
    <DetourProvider config={detourConfig}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <HeroUINativeProvider
              config={{
                devInfo: {
                  stylingPrinciples: false,
                },
              }}
            >
              <TamaguiProvider config={config} defaultTheme="light">
                <ErrorBoundary>
                  <PortalProvider shouldAddRootHost>
                    <IconContext.Provider
                      value={{
                        weight: "bold",
                        // color: "#eee",
                      }}
                    >
                      {children}
                    </IconContext.Provider>
                  </PortalProvider>
                </ErrorBoundary>
              </TamaguiProvider>
            </HeroUINativeProvider>
          </KeyboardProvider>
          <Toaster
            autoWiggleOnUpdate="toast-change"
            pauseWhenPageIsHidden
            richColors
            toastOptions={{
              titleStyle: {
                fontFamily: "Inter-SemiBold",
                fontSize: 18,
              },
              descriptionStyle: {
                fontFamily: "Inter-Regular",
                fontSize: 16,
              },
            }}
          />
          <DetourDeepLinkHandler />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </DetourProvider>
  );
};
