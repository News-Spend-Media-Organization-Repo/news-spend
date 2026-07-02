import { proxy } from "valtio";

export const routeState = proxy<{
  routeName: string | undefined;
  tabName: string | undefined;
  swipe: boolean;
  reactNavTabName: string | undefined;
}>({
  routeName: undefined,
  swipe: true,
  tabName: "latest",
  reactNavTabName: undefined,
});

export const setRouteName = (routeName: string | undefined) => {
  routeState.routeName = routeName;
};

export const setReactNavTabName = (tabName: string | undefined) => {
  routeState.reactNavTabName = tabName;
};
export const setTabName = (tabName: string | undefined) => {
  routeState.tabName = tabName;
};

export const setSwipe = (swipe: boolean) => {
  routeState.swipe = swipe;
};

export const liveBannerState = proxy<{
  isHidden: boolean;
}>({
  isHidden: false,
});

export const hideLiveBanner = () => {
  liveBannerState.isHidden = true;
};

export const showLiveBanner = () => {
  liveBannerState.isHidden = false;
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
