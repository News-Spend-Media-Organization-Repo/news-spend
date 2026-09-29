import type { LinkingOptions, RootParamList } from "@react-navigation/native";
import { DETOUR_LINKING_PREFIX, Detour } from "@swmansion/react-native-detour";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";

import { trackNotificationOpen } from "#/lib/trackNotificationOpen";

const prefixes = [
  DETOUR_LINKING_PREFIX,
  Linking.createURL(""),
  "https://link.newsspend.com/",
  "https://newspend.godetour.link/",
];

function ensureScheme(url: string) {
  // Check if the URL already starts with any of the valid schemes
  if (prefixes.some((scheme) => url?.startsWith(scheme))) {
    return url; // URL already has a valid scheme
  }

  // If no scheme, add the default (first) scheme
  return Linking.createURL(url);
}

/**
 * Tab segments from before detail screens moved to the root stack.
 * Links minted back then carry one (`news/article/...`); the canonical paths
 * no longer include it, so strip it. Sunset: notifications, widgets and
 * Detour links carrying the old form expire on their own.
 */
const LEGACY_TAB_PREFIXES = new Set(["news", "shop", "discover", "settings"]);

/** First path segments of root-level detail screens. */
const DETAIL_LEADS = new Set([
  "article",
  "detail",
  "profile",
  "activities",
  "blocked-users",
  "report",
  "notification",
  "data-manager",
  "delete-account",
  "rate-app",
  "share-app",
  "socials",
  "support",
  "identity-verification",
  "advertise",
  "call",
  "feedback",
  "faq",
  "email",
  "legal",
  "terms-of-use",
  "privacy-policy",
  "community-guidelines",
  "play-lottery",
  "buy-ticket",
  "boost-luck",
  "lucky-app-wall",
  "my-prizes",
  "claim-prize",
  "prize",
  "lottery-rules",
  "browser",
  "survey",
]);

function stripLegacyTabPrefix(url: string): string {
  const strip = (segments: string[]): string[] => {
    if (
      segments.length >= 2 &&
      LEGACY_TAB_PREFIXES.has(segments[0] ?? "") &&
      DETAIL_LEADS.has(segments[1] ?? "")
    ) {
      return segments.slice(1);
    }
    return segments;
  };

  try {
    const parsed = new URL(url);
    // Scheme URLs put the tab segment in the hostname
    // (`news-spend://news/article/x`).
    if (
      LEGACY_TAB_PREFIXES.has(parsed.hostname) &&
      DETAIL_LEADS.has(parsed.pathname.split("/").filter(Boolean)[0] ?? "")
    ) {
      return `${parsed.protocol}//${parsed.pathname
        .split("/")
        .filter(Boolean)
        .join("/")}${parsed.search}${parsed.hash}`;
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    const stripped = strip(segments);
    if (stripped.length === segments.length) {
      return url;
    }
    parsed.pathname = `/${stripped.join("/")}`;
    return parsed.toString();
  } catch {
    return strip(url.split("/").filter(Boolean)).join("/") || url;
  }
}

function withNewsId(url: string, newsId: unknown) {
  if (typeof newsId !== "string" || !newsId.length) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}newsId=${encodeURIComponent(newsId)}`;
}

export const linking: LinkingOptions<RootParamList> = {
  enabled: true,
  prefixes,
  async getInitialURL() {
    // check if app was opened from a Detour deferred link
    const detourUrl = await Detour.getInitialURL();
    if (detourUrl !== undefined) {
      return detourUrl;
    }

    // check if app was opened from a deep link
    const url = await Linking.getInitialURL();

    if (url !== null) {
      return url;
    }

    // check if app was opened from a notification
    const response = Notifications.getLastNotificationResponse();
    if (response?.notification.request.content.body) {
      const screenUrl = response?.notification.request.content.data?.url;
      const newsId = response?.notification.request.content.data?.newsId;

      console.log(response.notification.request.content);

      trackNotificationOpen({
        ...response.notification.request.content,
      });

      if (screenUrl) {
        return ensureScheme(withNewsId(screenUrl, newsId));
      }
    }
  },
  subscribe(listener) {
    // Detour also delivers incoming URLs, so it needs the same legacy-prefix
    // strip. otherwise it hands React Navigation the raw link first and the
    // rewrite below never gets a say.
    const detourSub = Detour.addEventListener("url", ({ url }) => {
      listener(stripLegacyTabPrefix(url));
    });

    const onReceiveURL = ({ url }: { url: string }) => {
      // Widget taps land here. Old tab-prefixed links are normalized to the
      // root-level detail paths.
      listener(stripLegacyTabPrefix(ensureScheme(url)));
    };

    // listen for incoming links from deep linking
    const eventListenerSub = Linking.addEventListener("url", onReceiveURL);

    // listen to expo push notifications
    const notificationListenerSub =
      Notifications.addNotificationResponseReceivedListener((response) => {
        let screenUrl = response.notification.request.content.data?.url;
        const newsId = response.notification.request.content.data?.newsId;
        const _common = response.notification.request.content.data?.common;

        if (screenUrl) {
          screenUrl = stripLegacyTabPrefix(screenUrl as string);
          listener(ensureScheme(withNewsId(screenUrl, newsId)));
          trackNotificationOpen({
            ...response.notification.request.content,
          });
        }
      });

    return () => {
      detourSub.remove();
      eventListenerSub.remove();
      notificationListenerSub.remove();
    };
  },
};
