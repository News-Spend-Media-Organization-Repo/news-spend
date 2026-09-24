import { Linking, Platform } from "react-native";
import Share, { type Social } from "react-native-share";

import { handOffShare } from "#/utils/handOffShare";

/**
 * Shares to Facebook or X, or opens the app's store page when it isn't
 * installed.
 *
 * `Share.shareSingle` can't do this on its own. On iOS it routes both targets
 * through `SLComposeViewController`, which has returned nil for them since
 * iOS 11: with the app installed nothing appears (and the share is still
 * counted), and without it the library opens the web sharer. On Android,
 * when the app is missing, it also falls back to the web.
 *
 * A trip to the store is not counted as a share.
 */
export type SocialApp = "facebook" | "twitter";

const APPS = {
  facebook: {
    social: Share.Social.FACEBOOK,
    iosScheme: "fb://",
    androidPackage: "com.facebook.katana",
    appStoreId: "284882215",
  },
  twitter: {
    social: Share.Social.TWITTER,
    iosScheme: "twitter://",
    androidPackage: "com.twitter.android",
    appStoreId: "333903271",
  },
} as const;

export async function isSocialAppInstalled(app: SocialApp): Promise<boolean> {
  const { iosScheme, androidPackage } = APPS[app];
  try {
    if (Platform.OS === "ios") {
      // Both schemes are in LSApplicationQueriesSchemes via the
      // react-native-share config plugin, so this answers truthfully.
      return await Linking.canOpenURL(iosScheme);
    }
    const { isInstalled } = await Share.isPackageInstalled(androidPackage);
    return isInstalled;
  } catch {
    return false;
  }
}

export async function openSocialAppStorePage(app: SocialApp): Promise<void> {
  const { androidPackage, appStoreId } = APPS[app];
  const [storeUrl, webUrl] =
    Platform.OS === "ios"
      ? [
          `itms-apps://apps.apple.com/app/id${appStoreId}`,
          `https://apps.apple.com/app/id${appStoreId}`,
        ]
      : [
          `market://details?id=${androidPackage}`,
          `https://play.google.com/store/apps/details?id=${androidPackage}`,
        ];
  try {
    await Linking.openURL(storeUrl);
  } catch {
    // No store app on this device (a simulator, or Android without Play).
    await Linking.openURL(webUrl);
  }
}

export async function shareToSocialApp(
  app: SocialApp,
  { message, url }: { message: string; url: string },
  onShare?: (shareMethod: string) => void
): Promise<void> {
  if (!(await isSocialAppInstalled(app))) {
    try {
      await openSocialAppStorePage(app);
    } catch (error) {
      console.log(error instanceof Error ? error.message : error);
    }
    return;
  }

  if (Platform.OS === "android") {
    await handOffShare(
      () =>
        Share.shareSingle({
          message,
          url,
          title: "Share via",
          social: APPS[app].social as Social,
          appId: "",
        }),
      app,
      onShare
    );
    return;
  }

  if (app === "twitter") {
    const text = encodeURIComponent(`${message} ${url}`);
    await handOffShare(
      () => Linking.openURL(`twitter://post?message=${text}`),
      app,
      onShare
    );
    return;
  }

  // The Facebook app has no URL scheme that opens a composer, and its SDK
  // isn't installed, so on iOS the share sheet is the way in: Facebook's
  // share extension is listed there when the app is installed.
  await handOffShare(
    () => Share.open({ message, url, title: "Share via" }),
    app,
    onShare
  );
}
