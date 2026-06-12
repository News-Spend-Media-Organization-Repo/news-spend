import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Home, PlusCircle, ShoppingCart, Tag, Video } from "@tamagui/lucide-icons";

import DiscoverStack from "./discover-stack";
import NewsStack from "./home-stack";
import LiveStack from "./live-stack";
import SettingsStack from "./settings-stack";
import ShopStack from "./shop-stack";
import TabBar from "./tab-bar";

export default createBottomTabNavigator({
  tabBar: (props) => <TabBar {...props} />,
  backBehavior: "history",
  screens: {
    Home: {
      linking: {
        path: "news",
        initialRouteName: "NewsHome",
      },
      screen: NewsStack,
      options: {
        tabBarIcon(props) {
          return <Home {...props} />;
        },
      },
    },
    Live: {
      linking: {
        path: "live",
        initialRouteName: "LiveHome",
      },
      screen: LiveStack,
      options: {
        tabBarIcon(props) {
          return <Video {...props} />;
        },
      },
    },
    Settings: {
      linking: {
        path: "settings",
        initialRouteName: "SettingsHome",
      },
      screen: SettingsStack,
      options: {
        headerShown: false,
        title: "Settings",
        tabBarIcon(props) {
          return <PlusCircle {...props} />;
        },
      },
    },
    Discover: {
      linking: {
        path: "discover",
        initialRouteName: "DiscoverHome",
      },
      screen: DiscoverStack,
      options: {
        tabBarIcon(props) {
          return <Tag {...props} />;
        },
      },
    },
    Shop: {
      linking: {
        path: "shop",
        initialRouteName: "ShopHome",
      },
      screen: ShopStack,
      options: {
        tabBarIcon(props) {
          return <ShoppingCart {...props} />;
        },
      },
    },
  },
  screenOptions: {
    headerShown: false,
    tabBarHideOnKeyboard: true,
    animation: "none",
  },
  initialRouteName: "Home",
});
