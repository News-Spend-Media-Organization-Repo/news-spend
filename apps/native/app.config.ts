import type { ConfigContext, ExpoConfig } from "@expo/config";
import pkg from "./package.json";

const APP_VARIANT = process.env.APP_VARIANT as
  | "development"
  | "beta"
  | "preview"
  | "production";
const _APP_ENV = process.env.APP_ENV as "local" | "preview" | "production";

// Urgency of the update being published. Only ever "mandatory" when the
// publisher says so explicitly, so a forgotten env var fails open (optional).
const UPDATE_PRIORITY =
  process.env.UPDATE_PRIORITY === "mandatory" ? "mandatory" : "optional";

const PACKAGE_NAME = "com.newsspend.app"; // Base package name
const VERSION = pkg.version;
// const VERSION_CODE = 28;

// Package name suffix based on environment
const getPackageSuffix = () => {
  switch (APP_VARIANT) {
    case "development":
      return ".dev";
    case "beta":
      return ".beta";
    case "preview":
      return ".preview";
    default:
      return "";
  }
};

// App name prefix based on environment
const getNamePrefix = () => {
  switch (APP_VARIANT) {
    case "development":
      return "[DEV]";
    case "beta":
      return "[BETA]";
    case "preview":
      return "[PREVIEW]";
    default:
      return "";
  }
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const packageSuffix = getPackageSuffix();
  const namePrefix = getNamePrefix();

  return {
    ...config,
    name: namePrefix ? `${namePrefix} ${config.name}` : (config.name as string),
    slug: config.slug as string,
    version: VERSION,

    runtimeVersion: {
      policy: "appVersion",
    },

    updates: {
      checkAutomatically: "ON_LOAD",

      fallbackToCacheTimeout: 0,
      url: "https://u.expo.dev/f652bbae-90d7-4074-b356-70438f948249",
      // Local builds get no channel from EAS, and the update server 400s
      // channel-less manifest requests — so a sideloaded build would never
      // see OTA updates. Bake the preview channel into local preview builds
      // (EAS builds set their own channel from the build profile).
      requestHeaders:
        APP_VARIANT === "preview"
          ? { "expo-channel-name": "preview" }
          : undefined,
    },

    plugins: [...(config.plugins ?? [])],

    // Android configuration
    android: {
      ...config.android,
      package: `${PACKAGE_NAME}${packageSuffix}`,
      googleServicesFile: "./google-services.json",
    },

    // iOS configuration
    ios: {
      ...config.ios,
      bundleIdentifier: `${PACKAGE_NAME}${packageSuffix}`,
      // buildNumber: VERSION,
      associatedDomains: [
        "applinks:link.newsspend.com",
        "applinks:newspend.godetour.link",
      ],
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        // Every screen sets a per-screen statusBarStyle; iOS only honours it
        // (and RNScreens stops asserting) when the view controller owns the
        // status bar. Without this the bar stays black on the navy headers.
        UIViewControllerBasedStatusBarAppearance: true,
      },
    },
    extra: {
      eas: {
        projectId: "f652bbae-90d7-4074-b356-70438f948249",
      },
      // Which build variant this binary is (development | beta | preview |
      // production). Read at runtime via Constants.expoConfig?.extra?.variant.
      variant: APP_VARIANT,
      // An update carries its own urgency. `eas update` bakes this config into
      // the manifest it publishes, so the client reads the value off the
      // incoming update, before downloading it, and without the running build
      // needing to have known about it. Publish a forced one with:
      //   UPDATE_PRIORITY=mandatory eas update --branch production
      updatePriority: UPDATE_PRIORITY,
    },
  };
};
