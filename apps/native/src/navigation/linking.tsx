import type { LinkingOptions, RootParamList } from "@react-navigation/native";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";

import { segmentClient } from "#/lib/segmentClient";
import { routeState } from "#/state/route-state";

const prefixes = [Linking.createURL(""), "https://link.newsspend.com/"];

function ensureScheme(url: string) {
  // Check if the URL already starts with any of the valid schemes
  if (prefixes.some((scheme) => url?.startsWith(scheme))) {
    return url; // URL already has a valid scheme
  }

  // If no scheme, add the default (first) scheme
  return Linking.createURL(url);
}

export const linking: LinkingOptions<RootParamList> = {
  enabled: true,
  prefixes,
  async getInitialURL() {
    // check if app was opened from a deep link
    const url = await Linking.getInitialURL();

    if (url !== null) {
      return url;
    }

    // check if app was opened from a notification
    const response = Notifications.getLastNotificationResponse();
    if (response?.notification.request.content.body) {
      const screenUrl = response?.notification.request.content.data?.url;

      console.log(response.notification.request.content);

      segmentClient.track("Notification Opened", {
        ...response.notification.request.content,
      });

      if (screenUrl) {
        return ensureScheme(screenUrl);
      }
    }
  },
  subscribe(listener) {
    const onReceiveURL = ({ url }: { url: string }) => {
      listener(ensureScheme(url));
    };

    // listen for incoming links from deep linking
    const eventListenerSub = Linking.addEventListener("url", onReceiveURL);

    // listen to expo push notifications
    const notificationListenerSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        let screenUrl = response.notification.request.content.data?.url;
        const common = response.notification.request.content.data?.common;

        if (screenUrl) {
          const currentTab = routeState.reactNavTabName ?? "NewsHome";
          const routeMap = {
            news: "NewsHome",
            live: "LiveHome",
            shop: "ShopHome",
            discover: "DiscoverHome",
            settings: "SettingsHome",
          };
          const tabName = screenUrl?.split("/")[0] as keyof typeof routeMap;
          if (currentTab && currentTab !== routeMap[tabName]) {
            const invertedRouteMap = Object.fromEntries(
              Object.entries(routeMap).map(([key, value]) => [value, key]),
            );
            screenUrl = `${invertedRouteMap[currentTab]}/${screenUrl?.split("/").slice(1).join("/")}`;
          }
          listener(ensureScheme(screenUrl));
          segmentClient.track("Notification Opened", {
            ...response.notification.request.content,
          });
        }
      },
    );

    return () => {
      eventListenerSub.remove();
      notificationListenerSub.remove();
    };
  },
};
