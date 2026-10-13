import {
  getStateFromPath as defaultGetStateFromPath,
  type LinkingOptions,
  type RootParamList,
} from "@react-navigation/native";
import { DETOUR_LINKING_PREFIX, Detour } from "@swmansion/react-native-detour";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";

import {
  type LegacyLinkSource,
  trackLegacyTabLink,
} from "#/lib/trackLegacyLink";
import { trackNotificationOpen } from "#/lib/trackNotificationOpen";

import { withArticleUnderComments } from "./article-under-comments";
import { normalizeLegacyTabPrefix } from "./legacy-tab-prefix";

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

function withNewsId(url: string, newsId: unknown) {
  if (typeof newsId !== "string" || !newsId.length) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}newsId=${encodeURIComponent(newsId)}`;
}

/**
 * Normalises an inbound URL, reporting when it still carried a legacy tab
 * segment. The reporting lives here rather than in the normaliser so that
 * module stays pure — and because the source is only known at the call site.
 */
function toAppPath(url: string, source: LegacyLinkSource): string {
  const { url: normalized, tab } = normalizeLegacyTabPrefix(url);
  if (tab) {
    trackLegacyTabLink({ tab, source });
  }
  return normalized;
}

// `screens` is omitted from `config`: the static `Navigation` component builds
// it from the navigator tree and only reads the extra options from here.
export const linking: Omit<LinkingOptions<RootParamList>, "config"> & {
  config: { initialRouteName: "Tab" };
} = {
  enabled: true,
  prefixes,
  config: {
    // Every root-level detail screen (article, comments, prize...) is a sibling
    // of `Tab`, so a link to one used to resolve to a stack holding only that
    // screen. On a cold start from a notification that left nothing underneath:
    // the Android back button and gesture exited the app, and the iOS edge swipe
    // had nowhere to go. With this, such a link resolves to [Tab, <screen>].
    // Routes missing from the active group (Tab while signed out) are dropped
    // when the state is rehydrated.
    initialRouteName: "Tab",
  },
  getStateFromPath(path, options) {
    return withArticleUnderComments(defaultGetStateFromPath(path, options));
  },
  async getInitialURL() {
    // Every branch below normalizes the URL the same way `subscribe` does.
    // Warm and cold starts used to disagree here: `subscribe` stripped the
    // legacy tab prefix but `getInitialURL` did not, so a link the CMS mints in
    // the old form (`news/article/<slug>`) resolved on a warm start and fell
    // through to the `*` catch-all — NotFound — on a cold one.
    // check if app was opened from a Detour deferred link
    const detourUrl = await Detour.getInitialURL();
    if (detourUrl !== undefined) {
      return toAppPath(detourUrl, "detour");
    }

    // check if app was opened from a deep link
    const url = await Linking.getInitialURL();

    if (url !== null) {
      return toAppPath(url, "initial-url");
    }

    // check if app was opened from a notification
    const response = Notifications.getLastNotificationResponse();
    if (response?.notification.request.content.body) {
      const screenUrl = response?.notification.request.content.data?.url;
      const newsId = response?.notification.request.content.data?.newsId;

      trackNotificationOpen({
        ...response.notification.request.content,
      });

      if (screenUrl) {
        return ensureScheme(
          withNewsId(toAppPath(screenUrl, "notification"), newsId)
        );
      }
    }
  },
  subscribe(listener) {
    // Detour also delivers incoming URLs, so it needs the same legacy-prefix
    // strip. otherwise it hands React Navigation the raw link first and the
    // rewrite below never gets a say.
    const detourSub = Detour.addEventListener("url", ({ url }) => {
      listener(toAppPath(url, "detour"));
    });

    const onReceiveURL = ({ url }: { url: string }) => {
      // Widget taps land here. Old tab-prefixed links are normalized to the
      // root-level detail paths.
      listener(toAppPath(ensureScheme(url), "incoming-url"));
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
          screenUrl = toAppPath(screenUrl as string, "notification");
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
