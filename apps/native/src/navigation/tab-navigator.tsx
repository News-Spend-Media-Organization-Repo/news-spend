import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Platform } from "react-native";
import ForYouScreen from "#/features/for-you/ForYouScreen";
import LiveScreen from "#/features/for-you/LiveScreen";
import { MoreTabPlaceholder } from "#/features/tabs/more/MoreSheet";
import { emitHomeTabRepeatPress } from "#/state/home-tab-repeat-press";
import DiscoverStack from "./discover-stack";
import NewsStack from "./home-stack";

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
      listeners: {
        // `behavior` is only set on a repeated press of the active tab. The
        // parameter names just the fields read: the exact tab event type
        // doesn't check through this nested static config (v8 alpha).
        tabPress: (e: { data?: { behavior?: { scrollToTop?: boolean } } }) => {
          if (e.data?.behavior?.scrollToTop) {
            emitHomeTabRepeatPress();
          }
        },
      },
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
    Live: {
      screen: LiveScreen,
      linking: { path: "live" },
      options: {
        tabBarIcon: () =>
          Platform.select({
            ios: { type: "sfSymbol", name: "dot.radiowaves.left.and.right" },
            android: { type: "materialSymbol", name: "live_tv" },
          }),
      },
    },
    ForYou: {
      screen: ForYouScreen,
      linking: { path: "for-you" },
      options: {
        title: "For You",
        tabBarIcon: ({ focused }) =>
          Platform.select({
            ios: { type: "sfSymbol", name: focused ? "sparkles" : "sparkles" },
            // `auto_awesome` is a Material Icons name, absent from Material
            // Symbols: it threw on Android. `star_shine` is the sparkle glyph.
            android: { type: "materialSymbol", name: "star_shine" },
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
    More: {
      // A button, not a tab: selection is disabled natively on both platforms
      // (preventDefault on tabPress throws with the native bar), and the press
      // opens the More sheet over whatever tab is current. The `more` link
      // belongs to the sheet route, in the root stack.
      screen: MoreTabPlaceholder,
      listeners: ({ navigation }) => ({
        tabPress: () => {
          navigation.navigate("MoreSheet");
        },
      }),
      options: {
        title: "More",
        tabBarSelectionEnabled: false,
        tabBarIcon: ({ focused }) =>
          Platform.select({
            ios: {
              type: "sfSymbol",
              name: focused ? "ellipsis.circle.fill" : "ellipsis.circle",
            },
            android: { type: "materialSymbol", name: "more_horiz" },
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
