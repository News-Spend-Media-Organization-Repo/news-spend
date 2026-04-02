import { CommonActions, useNavigation } from "@react-navigation/native";
import { Coins } from "@tamagui/lucide-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { differenceInDays, differenceInHours, endOfWeek } from "date-fns";
import { useRef } from "react";
import { toast } from "sonner-native";
import {
  Card,
  ScrollView,
  Separator,
  Stack,
  Unspaced,
  XStack,
  YStack,
} from "tamagui";
import { CaretLeft } from "tamagui-phosphor";

import { PartnerAdDialog } from "#/components/discover/PartnerAdDialog";
import { Screen } from "#/components/Screen";
import { Button, Text } from "#/components/ui";
import { useFocusBackHandler } from "#/hooks/useBackHandler";
import { orpc } from "#/lib/orpc";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

const BoostLuck = () => {
  const navigation = useNavigation("BoostLuck");
  const advertCount = useRef(0);
  const { data } = useQuery(orpc.lotteryTicket.getByUser.queryOptions());
  const boostLuckMutation = useMutation(
    orpc.lotteryTicket.boostLuck.mutationOptions({
      onSuccess: (data) => {
        advertCount.current += 1;
        toast.success("Luck Boosted!", {
          description: "",
        });
      },
    })
  );

  const insets = useSafeAreaInsetsStyle(["bottom", "top"]);

  const goToDiscoverHome = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "DiscoverHome" }],
      })
    );
    return true;
  };

  useFocusBackHandler(goToDiscoverHome);

  const onCountdownComplete = () => {
    boostLuckMutation.mutate({});
  };

  const onDialogOpen = () => {
    if (advertCount.current >= 3) {
      navigation.navigate("LuckyAppWall");
      return false;
    }
    return true;
  };

  const now = new Date();

  // Get the end of the current two-week period (next Monday)
  const endOfLotteryPeriod = endOfWeek(now, { weekStartsOn: 1 });
  if (endOfLotteryPeriod.getDate() - now.getDate() <= 7) {
    endOfLotteryPeriod.setDate(endOfLotteryPeriod.getDate() + 7);
  }

  // Calculate the difference in days
  const daysLeft = differenceInDays(endOfLotteryPeriod, now);

  // Calculate the difference in hours
  const hoursLeft = differenceInHours(endOfLotteryPeriod, now);

  const timeLeft =
    daysLeft > 1
      ? `${daysLeft} days`
      : `${hoursLeft} hour${hoursLeft > 1 ? "s" : ""}`;

  return (
    <Screen gap="$4">
      <XStack ai="center" bg="$p500" gap="$2.5" pt={insets.paddingTop} px="$2">
        <Button
          gap="$2"
          ghost
          h="auto"
          onPress={() => goToDiscoverHome()}
          p="$0"
          py="$2"
        >
          <Button.Icon color="#fff">
            <CaretLeft />
          </Button.Icon>
          <Button.Text color="#fff" fos="$4">
            Buy Lottery Tickets
          </Button.Text>
        </Button>
        <Text
          color="#fff"
          ml="auto"
          onPress={() => navigation.navigate("LotteryRules")}
        >
          Rules
        </Text>
      </XStack>

      <ScrollView gap="$5" pb={insets.paddingBottom} px="$4">
        <Stack gap="$4">
          <Stack gap="$2">
            <Text fos="$7" lh="$7" ta="center">
              Win Apple Watch, Gift Cards, 1000 points and more
            </Text>
            <Text ta="center">
              Countdown:{" "}
              <Text color="$p500" fos="$6">
                {timeLeft}
              </Text>{" "}
              left
            </Text>
          </Stack>

          <Card bg="$s300" p="$0" px="$6">
            <XStack ai="center" jc="space-between" minHeight="$9">
              <Stack ai="center" jc="center">
                <Text fos="$8">{data?.lottery_tickets?.count ?? 0} </Text>
                <Text>
                  Ticket
                  {(data?.lottery_tickets?.count ?? 0 > 1) ? "s" : ""}
                </Text>
              </Stack>

              <Separator als="stretch" bw="$1" marginHorizontal={15} vertical />

              <Button
                ghost
                h="auto"
                onPress={() => navigation.navigate("GetTicket")}
              >
                <Button.Text color="$p400" textDecorationLine="underline">
                  Purchase more tickets
                </Button.Text>
              </Button>
            </XStack>
          </Card>

          <Unspaced>
            <Text fos={15} mt="$1" mx="$1">
              Buy 10 or more tickets and your win ratio increases to more than
              50%.
            </Text>
          </Unspaced>

          <YStack gap="$4">
            <Text ta="center">Our sponsors wish you good luck.</Text>

            <PartnerAdDialog
              asChild
              onCountdownComplete={onCountdownComplete}
              onOpen={onDialogOpen}
            >
              <Button gap="$2" w="100%">
                <Button.Icon>
                  <Coins />
                </Button.Icon>
                <Button.Text>Boost Your Luck</Button.Text>
              </Button>
            </PartnerAdDialog>
          </YStack>
        </Stack>
      </ScrollView>
    </Screen>
  );
};
export default BoostLuck;
