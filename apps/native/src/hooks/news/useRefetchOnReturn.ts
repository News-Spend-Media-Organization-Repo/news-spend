import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect } from "react";

type Options = {
  refetch: () => void;
  /** From the query result — last time this query's data actually settled. */
  dataUpdatedAt: number;
  staleTime: number;
  /**
   * Whether this scene is the currently active tab in its parent TabView.
   * `react-native-tab-view` is a separate library from React Navigation, so
   * switching category tabs fires no navigation focus event — this is how
   * that return path gets detected instead. Omit for a screen that isn't
   * hosted inside a TabView.
   */
  isActiveTab?: boolean;
};

/**
 * Refetches a feed query when the user returns to it, but only if the data
 * has gone stale — covers two return paths that sit outside TanStack Query's
 * own refetchOnWindowFocus (that one only fires on app foreground, wired
 * separately via focusManager + AppState):
 *
 *  - React Navigation focus: back from an article, switching bottom tabs.
 *  - TabView category-tab switch: not a navigation event at all.
 *
 * Neither path skips a firing. They used to: focus skipped its first, and the
 * tab path skipped its initial active state, both on the reasoning that
 * "mounting already fetched fresh data". That is only true when the mount
 * actually hits the network. The query cache is persisted to MMKV and
 * rehydrated on launch, so a cold start can mount onto data that is already
 * hours old — and for a guest, who never crosses an auth boundary and so
 * never has their cache cleared, that rehydrated data is what they keep
 * seeing. That is the mechanism behind "news content as a guest lags like 1hr
 * behind". `refetchIfStale` already gates on age, so dropping the skips costs
 * nothing when the data really is fresh.
 */
export function useRefetchOnReturn({
  refetch,
  dataUpdatedAt,
  staleTime,
  isActiveTab = true,
}: Options) {
  const refetchIfStale = useCallback(() => {
    if (Date.now() - dataUpdatedAt >= staleTime) {
      refetch();
    }
  }, [refetch, dataUpdatedAt, staleTime]);

  useFocusEffect(refetchIfStale);

  useEffect(() => {
    if (isActiveTab) {
      refetchIfStale();
    }
  }, [isActiveTab, refetchIfStale]);
}
