import { useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { Pressable, View } from "react-native";

import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { useMarkInteractive } from "#/hooks/useMarkInteractive";
import { markOnboardingSeen } from "#/state/onboarding";

const Onboarding = () => {
  const navigation = useNavigation("Onboarding");

  useMarkInteractive(true);

  return (
    <Screen
      className="bg-p-50 px-6"
      navigationBarButtonStyle="dark"
      preset="fixed"
      statusBarStyle="dark"
    >
      <Pressable
        accessibilityLabel="Skip onboarding"
        accessibilityRole="button"
        className="self-end py-2"
        hitSlop={10}
        onPress={() => {
          markOnboardingSeen();
          navigation.replace("Welcome");
        }}
      >
        <Text className="font-semibold text-p-500 text-sm">Skip</Text>
      </Pressable>

      <View className="flex-1 items-center justify-center">
        <Image
          accessibilityLabel="People enjoying meaningful online connections"
          contentFit="contain"
          source={require("#/images/onboarding-1.png")}
          style={{
            width: "100%",
            aspectRatio: 2000 / 1333,
          }}
        />
      </View>

      <View className="items-center gap-3">
        <Text className="text-center text-p-500" variant="HeadingLarge">
          Your Time Online Should Move Your Life Forward
        </Text>
        <Text className="text-center text-gray-50" variant="body">
          Discover a new world where everyday digital engagement opens the door
          to meaningful, life-enhancing opportunities.
        </Text>
      </View>

      <View className="gap-6 pt-8 pb-2">
        <View
          accessibilityLabel="Onboarding screen 1 of 3"
          accessibilityRole="progressbar"
          accessibilityValue={{ max: 3, min: 1, now: 1 }}
          className="flex-row items-center justify-center gap-2"
        >
          <View className="h-2 w-6 rounded-full bg-p-500" />
          <View className="h-2 w-2 rounded-full bg-p-100" />
          <View className="h-2 w-2 rounded-full bg-p-100" />
        </View>

        <Button
          className="bg-p-500"
          onPress={() => navigation.replace("OnboardingTwo")}
          size="lg"
        >
          <Button.Label className="text-p-50">
            Move Your Life Forward
          </Button.Label>
        </Button>
      </View>
    </Screen>
  );
};

export default Onboarding;
