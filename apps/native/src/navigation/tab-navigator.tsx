import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  HouseIcon,
  PlusCircleIcon,
  ShoppingCartIcon,
  TagIcon,
  VideoCameraIcon,
} from "phosphor-react-native";

import DiscoverStack from "./discover-stack";
import NewsStack from "./home-stack";
import LiveStack from "./live-stack";
import SettingsStack from "./settings-stack";
import ShopStack from "./shop-stack";
import TabBar from "./tab-bar";

export default createBottomTabNavigator({
  tabBar: (props) => <TabBar {...props} />,
  implementation: "custom",
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
          return (
            <HouseIcon
              color={props.color.toString()}
              size={props.size}
              weight="regular"
            />
          );
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
          return (
            <VideoCameraIcon
              color={props.color.toString()}
              size={props.size}
              weight="regular"
            />
          );
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
          return (
            <PlusCircleIcon
              color={props.color.toString()}
              size={props.size}
              weight="regular"
            />
          );
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
          return (
            <TagIcon color={props.color} size={props.size} weight="regular" />
          );
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
          return (
            <ShoppingCartIcon
              color={props.color.toString()}
              size={props.size}
              weight="regular"
            />
          );
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
