import Constants from "expo-constants";

/**
 * Where the app talks to the API.
 *
 * `EXPO_PUBLIC_API_URL` is inlined into the JavaScript bundle at the moment
 * that bundle is built, and `eas update` builds one on whatever machine runs
 * it. The production value does not live in `.env` or in the `production`
 * build profile — it is an EAS environment variable, which the CLI only loads
 * when told to:
 *
 *   eas update --branch production --environment production
 *
 * Without that flag the variable is simply absent, and this used to return an
 * empty string: every request in the app then went out with an empty origin
 * and came back Not Found. Nothing failed at publish time, nothing looked
 * wrong in the update, and the app was comprehensively broken for everyone who
 * took the update. That happened on 14 Sep 2026.
 *
 * So an absent URL now throws where it is read, at startup, rather than
 * resolving to nothing a thousand times over. A production bundle that cannot
 * name its API is not a bundle worth shipping, and the error says which flag
 * was missing — the failure and its cause arrive together.
 */
export const getBaseUrl = () => {
  const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

  if (!__DEV__) {
    if (!API_URL) {
      throw new Error(
        "EXPO_PUBLIC_API_URL is missing from this bundle. It is an EAS " +
          "environment variable, so `eas update` needs --environment " +
          "production (or the matching environment) to inline it."
      );
    }

    return API_URL;
  }

  const debuggerHost =
    Constants.expoGoConfig?.debuggerHost ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost;
  const localhost = debuggerHost?.split(":")[0];

  if (!localhost) {
    throw new Error(
      "Failed to get localhost. Please point to your production server."
    );
  }

  return `http://${localhost}:9000`;
};
