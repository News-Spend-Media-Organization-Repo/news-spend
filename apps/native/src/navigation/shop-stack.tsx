import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View } from "react-native";
import { NavigatorErrorBoundary } from "#/components/ErrorBoundaries/NavigatorErrorBoundary";
import { Text } from "#/components/heroui/text";
import ShopHome from "#/features/tabs/shop/screens/ShopHome";
import { sharedScreens } from "./shared-screens";

function ShopHeader() {
  return (
    <View className="bg-p-500 px-2 pt-safe-offset-1 pb-2">
      <Text className="font-bold text-background text-lg uppercase">News Spend Media</Text>
    </View>
  );
}

export default createNativeStackNavigator({
  layout: ({ children, state, descriptors, navigation }) => (
    <NavigatorErrorBoundary>{children}</NavigatorErrorBoundary>
  ),
  screens: {
    ShopHome: {
      screen: ShopHome,
      linking: {
        path: "shop",
      },
      options: {
        headerShown: true,
        animation: "slide_from_right",
        header: ShopHeader,
      },
    },
    ...sharedScreens,
  },
  screenOptions: {
    headerShown: false,
    animation: "slide_from_right",
  },
  initialRouteName: "ShopHome",
});
