import { useNavigation } from "@react-navigation/native";
import { View } from "react-native";

import { ScreenHeader } from "#/components";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";

const LotteryRules = () => {
  const navigation = useNavigation();

  return (
    <Screen className="pb-safe" systemBarStyle="light">
      <ScreenHeader title="Lottery Rules" />

      <View className="gap-4 px-4 py-6">
        <Text>
          1. The draw is bi-weekly. You can see the time left until the next draw on the lottery
          screen.
        </Text>
        <Text>
          2. You can play the lottery by purchasing tickets with your points. Each ticket costs 50
          points. You can buy as many tickets as you want.
        </Text>
        <Text>
          3. The winner is chosen randomly. The more tickets you have, the higher your chances of
          winning.
        </Text>
        <Text>4. Points used to purchase tickets are non refundable and non transferable.</Text>
        <Text>
          5. The prizes to be won are listed on the lottery page. The prizes are subject to change
          at any time.
        </Text>
      </View>
    </Screen>
  );
};

export default LotteryRules;
