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
