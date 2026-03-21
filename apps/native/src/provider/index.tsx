import { AnalyticsProvider } from "@segment/analytics-react-native";
import { IconContext } from "phosphor-react-native";
import ErrorBoundary from "react-native-error-boundary";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { PortalProvider, TamaguiProvider } from "tamagui";

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
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AnalyticsProvider client={segmentClient}>
          <KeyboardProvider>
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

        {/*<OptIn
          activityIndicator="#ffffff"
          containerStyle={{
            // backgroundColor: "#ecf3fe",
            width: "100%",
            position: "absolute",
            top: 40,
          }}
          enableNotificationButtonLabel="Go to Settings"
          enableNotificationButtonLabelStyle={{}}
          enableNotificationButtonStyle={{}}
          enableNotificationContainerStyle={{}}
          enableNotificationLabel="Missed something? Enable notifications in settings and restart the app to stay in the loop."
          enableNotificationLabelStyle={{}}
          externalIdentity={{
            id: "2287a92f-867c-408e-bdc4-c3777be68c7b",
            name: "George Washington",
            email: "washington@wh.gov",
            phone: "202-456-1111",
          }}
          primaryButtonLabel="Enable"
          primaryButtonLabelStyle={{}}
          primaryButtonStyle={{}}
          primaryColor="#4285f4"
          retrySubscriptionIntervalDays={3}
          secondaryButtonLabel="Maybe Later"
          secondaryButtonLabelStyle={{}}
          secondaryButtonStyle={{}}
          secondaryColor="#F1F4FF"
          subtitle="Get notified about important updates and news."
          subtitleStyle={{}}
          title="Stay Updated"
          titleStyle={{}}
        />*/}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};
