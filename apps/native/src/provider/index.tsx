import { AnalyticsProvider } from "@segment/analytics-react-native";
import { HeroUINativeProvider } from "heroui-native";
import { IconContext } from "phosphor-react-native";
import ErrorBoundary from "react-native-error-boundary";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaListener, SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { PortalProvider, TamaguiProvider } from "tamagui";
import { Uniwind } from "uniwind";

import { tokens } from "#/constants/tokens";
import { useListeningTimeSync } from "#/hooks/discover/useListeningTime";
import usePushNotification from "#/hooks/usePushNotification";
import { segmentClient } from "#/lib/segmentClient";
import config from "#/tamagui.config";

type Props = {
  children: React.ReactNode;
};

export const Provider = ({ children }: Props) => {
  useListeningTimeSync();
  usePushNotification();

  return (
    <SafeAreaProvider>
      <SafeAreaListener
        onChange={({ insets }) => {
          Uniwind.updateInsets(insets);
        }}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AnalyticsProvider client={segmentClient}>
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
                        value={{ weight: "bold", color: tokens.color.p500.val }}
                      >
                        {children}
                      </IconContext.Provider>
                    </PortalProvider>
                  </ErrorBoundary>
                </TamaguiProvider>
              </HeroUINativeProvider>
            </KeyboardProvider>
          </AnalyticsProvider>
          <Toaster
            autoWiggleOnUpdate="toast-change"
            pauseWhenPageIsHidden
            toastOptions={{
              titleStyle: {
                fontFamily: "Inter-SemiBold",
                fontSize: 18,
              },
              descriptionStyle: {
                fontFamily: "Inter-Medium",
                fontSize: 16,
              },
            }}
          />
        </GestureHandlerRootView>
      </SafeAreaListener>
    </SafeAreaProvider>
  );
};
