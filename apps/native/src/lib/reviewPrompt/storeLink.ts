import { Platform } from "react-native";

import { openStoreLink } from "#/utils/openStoreLink";

const IOS_STORE_URL = "https://apps.apple.com/app/id6776046600";
const ANDROID_PACKAGE = "com.newsspend.app";

/** Straight to the write-review page, not just the product page. */
const IOS_REVIEW_URL = `${IOS_STORE_URL}?action=write-review`;
const ANDROID_STORE_URL = `market://details?id=${ANDROID_PACKAGE}`;
const ANDROID_WEB_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

/**
 * Opens this app's store page, the destination of the Settings rating sheet.
 *
 * Deliberately not the in-app review API: Google's quota can decline to show
 * that dialog, which would make a button the user pressed look broken. A
 * manual request needs a destination that always exists.
 *
 * Resolves true when something opened.
 */
export async function openStoreReviewPage(): Promise<boolean> {
  if (Platform.OS === "ios") {
    return openStoreLink(IOS_REVIEW_URL);
  }

  if (await openStoreLink(ANDROID_STORE_URL)) {
    return true;
  }
  return openStoreLink(ANDROID_WEB_URL);
}
