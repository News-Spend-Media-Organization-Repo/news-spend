import type { Config } from "@swmansion/react-native-detour";

/**
 * Detour config for deferred deep linking.
 *
 * linkProcessingMode: "deferred-only"
 *   React Navigation's own linking config handles Universal Links and App Links
 *   at runtime. Detour only adds first-install deferred link recovery on top.
 *
 * shouldUseClipboard: false (default)
 *   Set to true to enable clipboard-based link recovery on iOS at the cost of
 *   showing the system clipboard-access banner on iOS 16+.
 */
export const detourConfig: Config = {
  apiKey: process.env.EXPO_PUBLIC_DETOUR_API_KEY as string,
  appID: process.env.EXPO_PUBLIC_DETOUR_APP_ID as string,
  shouldUseClipboard: false,
  linkProcessingMode: "deferred-only",
};
