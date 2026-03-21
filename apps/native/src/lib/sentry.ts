import * as Sentry from "@sentry/react-native";

export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

export const initSentry = () => {
  if (!__DEV__) {
    Sentry.init({
      dsn: "https://da31e9a0b06dd748c0616a19b2d3d48e@o4507648362938368.ingest.de.sentry.io/4507648370212944",
      // Enable Logs
      enableLogs: true,

      // uncomment the line below to enable Spotlight (https://spotlightjs.com)
      // spotlight: __DEV__,
      integrations: [navigationIntegration],
    });
  }
};
