import { useNavigation } from "@react-navigation/native";
import { ScrollView, Stack, XStack } from "tamagui";
import { CaretLeft } from "tamagui-phosphor";

import { Screen } from "#/components/Screen";
import { Button, Text } from "#/components/ui";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

const LotteryRules = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsetsStyle(["bottom", "top"]);

  return (
    <Screen
      contentContainerStyle={{
        paddingBottom: insets.paddingBottom,
      }}
    >
      <Stack bg="$p500" gap="$2" pt={insets.paddingTop} px="$2">
        <XStack ai="center" gap="$2.5">
          <Button
            gap="$2"
            ghost
            h="auto"
            onPress={() => navigation.goBack()}
            p="$0"
            py="$2"
          >
            <Button.Icon color="#fff">
              <CaretLeft />
            </Button.Icon>
            <Button.Text color="#fff" fos="$4">
              Lottery Rules
            </Button.Text>
          </Button>
        </XStack>
      </Stack>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 24,
        }}
      >
        <Stack gap="$4">
          <Text>
            1. The draw is bi-weekly. You can see the time left until the next
            draw on the lottery screen.
          </Text>
          <Text>
            2. You can play the lottery by purchasing tickets with your points.
            Each ticket costs 50 points. You can buy as many tickets as you
            want.
          </Text>
          <Text>
            3. The winner is chosen randomly. The more tickets you have, the
            higher your chances of winning.
          </Text>
          <Text>
            4. Points used to purchase tickets are non refundable and non
            transferable.
          </Text>
          <Text>
            5. The prizes to be won are listed on the lottery page. The prizes
            are subject to change at any time.
          </Text>
        </Stack>
      </ScrollView>
    </Screen>
  );
};
export default LotteryRules;
