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
import { navigationRef } from "./navigationUtils";
import { TAB_PATHS } from "./tab-paths";

const LEADING_SLASHES = /^\/+/;
const EVENT_ORDER_PATH = /^\/?events\/order\//;

/**
 * The order return link is minted as a public `/events/order/<reference>` URL,
 * but the screen lives in the Discover stack whose paths are nested under the
 * tab. Add the tab segment the router expects; every other path is untouched.
 */
function withDiscoverTab(path: string) {
  return EVENT_ORDER_PATH.test(path)
    ? `${TAB_PATHS.Discover}/${path.replace(LEADING_SLASHES, "")}`
    : path;
}

const prefixes = [
  DETOUR_LINKING_PREFIX,
  Linking.createURL(""),
  "https://link.newsspend.com/",
  "https://newspend.godetour.link/",
];

function ensureScheme(url: string) {
  if (prefixes.some((scheme) => url?.startsWith(scheme))) {
    return url; // URL already has a valid scheme
  }

  /*
   * Not `Linking.createURL(url)`: it runs `encodeURI` over the path, which
   * re-encodes the `%` of an already-encoded query. A web destination arrives
   * as `browser?url=https%3A%2F%2F…`; after createURL the router decodes once
   * and hands the WebView the literal string `https%3A%2F%2F…`, which loads
   * nothing and has no domain for the header. Join the scheme by hand.
   */
  const base = Linking.createURL("");
  const separator = base.endsWith("/") ? "" : "/";
  return `${base}${separator}${url.replace(LEADING_SLASHES, "")}`;
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

/**
 * The in-app path (leading slash, no scheme) a notification's data points at,
 * or undefined when it has none.
 *
 * For navigating from inside the app (the inbox) with React Navigation's
 * `linkTo`. Going through `Linking.openURL` instead hands the URL to the OS,
 * which can route it to another installed build that claims the same scheme
 * and backgrounds this one.
 */
export function notificationDataPath(
  data: Record<string, unknown> | undefined
): string | undefined {
  const screenUrl = data?.url;

  if (typeof screenUrl !== "string" || !screenUrl.length) {
    return;
  }

  const { url } = normalizeLegacyTabPrefix(screenUrl);
  const scheme = prefixes.find((prefix) => url.startsWith(prefix));
  const path = scheme ? url.slice(scheme.length) : url;

  return `/${withNewsId(path, data?.newsId).replace(LEADING_SLASHES, "")}`;
}

/**
 * The app URL a notification's data points at, or undefined when it has none.
 * What a tapped push resolves to; the inbox uses `notificationDataPath`.
 */
export function notificationDataTarget(
  data: Record<string, unknown> | undefined
): string | undefined {
  const path = notificationDataPath(data);
  return path ? ensureScheme(path) : undefined;
}

/** The app path a tapped notification points at, or undefined when it has none. */
function notificationTarget(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as
    | Record<string, unknown>
    | undefined;

  // Tracking stays here: the pure helper is shared with in-app rows, which are
  // not notification taps.
  const screenUrl = data?.url;
  if (typeof screenUrl === "string") {
    const { tab } = normalizeLegacyTabPrefix(screenUrl);
    if (tab) {
      trackLegacyTabLink({ tab, source: "notification" });
    }
  }

  return notificationDataTarget(data);
}

/**
 * The response the initial URL was built from. `subscribe` replays the last
 * response for taps that landed after that read; this keeps the replay from
 * routing the same notification twice.
 */
let initialNotificationResponseId: string | undefined;

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
    return withArticleUnderComments(
      defaultGetStateFromPath(withDiscoverTab(path), options)
    );
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
    const content = response?.notification.request.content;
    if (response && content?.body) {
      trackNotificationOpen({
        title: content.title ?? undefined,
        body: content.body,
        data: content.data,
      });

      const url = notificationTarget(response);
      if (url) {
        initialNotificationResponseId =
          response.notification.request.identifier;
        return url;
      }
    }
  },
  subscribe(listener) {
    // Until `getInitialState` resolves, the container renders a fallback and
    // React Navigation's listener drops anything it cannot navigate yet. Hold
    // the URL instead of losing the tap or link.
    const readyUnsubscribes: (() => void)[] = [];
    const deliver = (url: string) => {
      if (navigationRef.isReady()) {
        listener(url);
        return;
      }
      readyUnsubscribes.push(
        navigationRef.addListener("ready", () => listener(url))
      );
    };

    // Detour also delivers incoming URLs, so it needs the same legacy-prefix
    // strip. otherwise it hands React Navigation the raw link first and the
    // rewrite below never gets a say.
    const detourSub = Detour.addEventListener("url", ({ url }) => {
      deliver(toAppPath(url, "detour"));
    });

    const onReceiveURL = ({ url }: { url: string }) => {
      // Widget taps land here. Old tab-prefixed links are normalized to the
      // root-level detail paths.
      deliver(toAppPath(ensureScheme(url), "incoming-url"));
    };

    // listen for incoming links from deep linking
    const eventListenerSub = Linking.addEventListener("url", onReceiveURL);

    const routeNotification = (
      response: Notifications.NotificationResponse
    ) => {
      const url = notificationTarget(response);
      if (!url) {
        return;
      }
      const { content } = response.notification.request;
      trackNotificationOpen({
        title: content.title ?? undefined,
        body: content.body ?? undefined,
        data: content.data,
      });
      deliver(url);
    };

    // listen to expo push notifications
    const notificationListenerSub =
      Notifications.addNotificationResponseReceivedListener(routeNotification);

    // On Android the tap is recorded by a broadcast the OS delivers after
    // starting the app, so it can land after `getInitialURL` already read the
    // last response — that response was then delivered only to a listener
    // that was not registered or not navigable yet, and the tap was lost.
    // Replay it here once the listener exists.
    const pending = Notifications.getLastNotificationResponse();
    if (
      pending &&
      pending.notification.request.identifier !== initialNotificationResponseId
    ) {
      routeNotification(pending);
    }

    return () => {
      detourSub.remove();
      eventListenerSub.remove();
      notificationListenerSub.remove();
      for (const unsubscribe of readyUnsubscribes) {
        unsubscribe();
      }
    };
  },
};
