import * as Sentry from "@sentry/react-native";

export let navigationIntegration: ReturnType<typeof Sentry.reactNavigationIntegration>;

export const initSentry = () => {
  if (__DEV__) {
    return;
  }

  navigationIntegration = Sentry.reactNavigationIntegration({
    enableTimeToInitialDisplay: true,
  });

  Sentry.init({
    dsn: "https://da31e9a0b06dd748c0616a19b2d3d48e@o4507648362938368.ingest.de.sentry.io/4507648370212944",
    enableLogs: true,
    integrations: [navigationIntegration],
  });
};
