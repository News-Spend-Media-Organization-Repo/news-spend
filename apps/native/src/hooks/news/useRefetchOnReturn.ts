import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef } from "react";

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
 * Both skip their first firing (initial mount already fetched fresh data).
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

  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      refetchIfStale();
    }, [refetchIfStale])
  );

  // Fires only on a false→true transition, never on the tab's initial
  // active state — mounting already fetched.
  const wasActiveTab = useRef(isActiveTab);
  useEffect(() => {
    if (isActiveTab && !wasActiveTab.current) {
      refetchIfStale();
    }
    wasActiveTab.current = isActiveTab;
  }, [isActiveTab, refetchIfStale]);
}
