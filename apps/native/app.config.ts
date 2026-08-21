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

// Widget serverUpdate polling follows the same API host the app itself talks
// to (EXPO_PUBLIC_API_URL), so dev/beta/preview builds don't silently poll
// production. Falls back to production when unset (e.g. EAS production env).
const WIDGET_SERVER_UPDATE_URL = `${
  process.env.EXPO_PUBLIC_API_URL || "https://api.newsspend.com"
}/api/widgets`;

const VOLTRA_PLUGIN_NAMES = new Set([
  "@use-voltra/ios-client",
  "@use-voltra/android-client",
]);

function withVariantAwareWidgetServerUpdate(
  plugins: NonNullable<ExpoConfig["plugins"]>
): NonNullable<ExpoConfig["plugins"]> {
  return plugins.map((plugin) => {
    if (
      !Array.isArray(plugin) ||
      typeof plugin[0] !== "string" ||
      !VOLTRA_PLUGIN_NAMES.has(plugin[0])
    ) {
      return plugin;
    }

    const [name, options] = plugin as [string, { widgets: any[] }];
    return [
      name,
      {
        ...options,
        widgets: options.widgets.map((widget) =>
          widget.serverUpdate
            ? {
                ...widget,
                serverUpdate: {
                  ...widget.serverUpdate,
                  url: WIDGET_SERVER_UPDATE_URL,
                },
              }
            : widget
        ),
      },
    ];
  }) as NonNullable<ExpoConfig["plugins"]>;
}

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
    },

    plugins: withVariantAwareWidgetServerUpdate(config.plugins ?? []),

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
