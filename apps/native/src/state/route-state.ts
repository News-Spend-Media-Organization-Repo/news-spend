import { Platform } from "react-native";
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
  // The native bar can't report its height (the library's own
  // useBottomTabBarHeight resolves to 0 under the native implementation),
  // and on iOS content extends beneath the translucent bar — so lists need
  // explicit bottom clearance again. Standard platform heights: 49pt bar +
  // 34pt home indicator on iOS, 80dp Material bar on Android. Slightly roomy
  // on indicator-less phones; the call-site `+ N` constants add margin.
  height: Platform.select({ ios: 83, android: 80, default: 83 }),
});

export const setTabBarHeight = (height: number) => {
  if (tabBarState.height !== height) {
    tabBarState.height = height;
  }
};

/**
 * Bottom clearance for the native tab bar. See tabBarState above for why
 * this is an estimate rather than a measurement.
 */
export const useTabBarHeight = () => useSnapshot(tabBarState).height;
