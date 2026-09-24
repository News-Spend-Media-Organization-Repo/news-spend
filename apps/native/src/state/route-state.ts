import { proxy, useSnapshot } from "valtio";

export const routeState = proxy<{
  routeName: string | undefined;
  tabName: string | undefined;
  swipe: boolean;
}>({
  routeName: undefined,
  swipe: true,
  tabName: "latest",
});

export const setRouteName = (routeName: string | undefined) => {
  routeState.routeName = routeName;
};

export const setTabName = (tabName: string | undefined) => {
  routeState.tabName = tabName;
};

export const setSwipe = (swipe: boolean) => {
  routeState.swipe = swipe;
};

export const tabBarState = proxy<{
  height: number;
}>({
  height: 0,
});

export const setTabBarHeight = (height: number) => {
  if (tabBarState.height !== height) {
    tabBarState.height = height;
  }
};

/**
 * Legacy manual tab bar height. With full native tabs the platform bar is
 * in-flow (not an overlay), so screens above it need no extra clearance and
 * nothing reports a height here anymore — this stays 0 and the `+ N`
 * constants at call sites act as plain breathing room.
 */
export const useTabBarHeight = () => useSnapshot(tabBarState).height;
