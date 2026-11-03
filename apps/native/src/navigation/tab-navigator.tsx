import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Platform } from "react-native";

import DiscoverStack from "./discover-stack";
import NewsStack from "./home-stack";
import SettingsStack from "./settings-stack";
import ShopStack from "./shop-stack";
import { TAB_PATHS } from "./tab-paths";

// Dark navy backing the native bar (matches splash + p-500).
const TAB_BAR_BACKGROUND = "#00233D";

export default createBottomTabNavigator({
  // No `tabBar` prop: with `implementation: "native"` that is what hides the
  // native UITabBarController / BottomNavigationView and renders a JS bar
  // instead. Omitting it reveals the platform bar.
  implementation: "native",
  backBehavior: "history",
  screens: {
    Home: {
      linking: {
        path: TAB_PATHS.Home,
        initialRouteName: "NewsHome",
      },
      screen: NewsStack,
      options: {
        tabBarIcon: ({ focused }) =>
          Platform.select({
            ios: {
              type: "sfSymbol",
              name: focused ? "house.fill" : "house",
            },
            android: { type: "materialSymbol", name: "house" },
          }),
      },
    },
    Discover: {
      linking: {
        path: TAB_PATHS.Discover,
        initialRouteName: "DiscoverHome",
      },
      screen: DiscoverStack,
      options: {
        // NOTE: materialSymbol 'tag' rasterizes as "#" on Android (see
        // tab-bar '#" report 2026-09-28); 'sell' is the equivalent tag glyph.
        tabBarIcon: ({ focused }) =>
          Platform.select({
            ios: {
              type: "sfSymbol",
              name: focused ? "tag.fill" : "tag",
            },
            android: { type: "materialSymbol", name: "sell" },
          }),
      },
    },
    Shop: {
      linking: {
        path: TAB_PATHS.Shop,
        initialRouteName: "ShopHome",
      },
      screen: ShopStack,
      options: {
        tabBarIcon: ({ focused }) =>
          Platform.select({
            ios: {
              type: "sfSymbol",
              name: focused ? "cart.fill" : "cart",
            },
            android: { type: "materialSymbol", name: "shopping_cart" },
          }),
      },
    },
    Me: {
      linking: {
        path: TAB_PATHS.Me,
        initialRouteName: "SettingsHome",
      },
      screen: SettingsStack,
      options: {
        title: "Me",
        tabBarIcon: ({ focused }) =>
          Platform.select({
            ios: {
              type: "sfSymbol",
              name: focused ? "person.fill" : "person",
            },
            android: { type: "materialSymbol", name: "person" },
          }),
      },
    },
  },
  screenOptions: {
    headerShown: false,
    tabBarStyle: {
      backgroundColor: TAB_BAR_BACKGROUND,
    },
    // iOS 26+ renders a light adaptive glass bar: the active tab needs a
    // dark tint to read on it. Android keeps the solid navy bar, so the
    // active tab stays white there.
    tabBarActiveTintColor: Platform.select({
      ios: TAB_BAR_BACKGROUND,
      android: "#FFFFFF",
    }),
    tabBarInactiveTintColor: "#9CA3AF",
    // Android Material 3 pill behind the active icon.
    tabBarActiveIndicatorColor: "rgba(255,255,255,0.24)",
    tabBarRippleColor: "rgba(255,255,255,0.32)",
  },
  initialRouteName: "Home",
});
