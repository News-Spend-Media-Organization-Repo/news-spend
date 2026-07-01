import { CommonActions, useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInDays, differenceInHours, endOfWeek } from "date-fns";
import { Card } from "heroui-native";
import { CoinsIcon } from "phosphor-react-native";
import { useRef } from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import { ScreenHeader } from "#/components";
import { PartnerAdDialog } from "#/components/discover/PartnerAdDialog";
import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { useFocusBackHandler } from "#/hooks/useBackHandler";
import { orpc } from "#/lib/orpc";

const BoostLuck = () => {
  const navigation = useNavigation("BoostLuck");
  const advertCount = useRef(0);
  const queryClient = useQueryClient();
  const { data } = useQuery(orpc.lotteryTicket.getByUser.queryOptions());
  const boostLuckMutation = useMutation(
    orpc.lotteryTicket.boostLuck.mutationOptions({
      onSuccess: () => {
        advertCount.current += 1;
        toast.success("Luck Boosted!", {
          description: "",
        });
        queryClient.invalidateQueries({
          queryKey: orpc.lotteryTicket.getByUser.queryKey(),
        });
      },
      onError: (error) => {
        toast.error("Failed to boost luck", {
          description: error.message,
        });
      },
    }),
  );

  const goToDiscoverHome = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "DiscoverHome" }],
      }),
    );
    return true;
  };

  useFocusBackHandler(goToDiscoverHome);

  const onCountdownComplete = () => {
    boostLuckMutation.mutate(undefined);
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
    daysLeft > 1 ? `${daysLeft} days` : `${hoursLeft} hour${hoursLeft > 1 ? "s" : ""}`;

  return (
    <Screen className="gap-4 pb-safe" systemBarStyle="light">
      <ScreenHeader
        right={
          <Text className="text-white" onPress={() => navigation.navigate("LotteryRules")}>
            Rules
          </Text>
        }
        title="Boost Your Entries"
      />

      <View className="gap-5 px-4 pt-2">
        <View className="gap-2">
          <Text className="text-center text-xl">
            Win Dream Points, airtime, data bundles, and other prizes
          </Text>
          <Text className="text-center">
            Countdown: <Text className="text-lg text-p-500">{timeLeft}</Text> left
          </Text>
        </View>

        <Card className="rounded-md bg-s-300 p-0 px-6">
          <View className="min-h-18 flex-row items-center justify-between">
            <View className="items-center justify-center">
              <Text className="text-2xl">{data?.lottery_tickets?.count ?? 0}</Text>
              <Text>
                Ticket
                {(data?.lottery_tickets?.count ?? 0) > 1 ? "s" : ""}
              </Text>
            </View>

            <View className="mx-3.75 w-px self-stretch bg-gray-300" />

            <Button
              className="h-auto"
              onPress={() => navigation.navigate("GetTicket")}
              variant="ghost"
            >
              <Button.Label className="text-p-400 underline">Get more entries</Button.Label>
            </Button>
          </View>
        </Card>

        <View className="gap-4">
          <Text className="text-center">Our sponsors wish you good luck.</Text>

          <PartnerAdDialog asChild onCountdownComplete={onCountdownComplete} onOpen={onDialogOpen}>
            <Button className="w-full flex-row items-center justify-center gap-2 rounded-lg bg-p-400 px-4 py-3">
              <CoinsIcon color="white" size={20} />
              <Button.Label className="font-semibold text-white">Boost Your Entries</Button.Label>
            </Button>
          </PartnerAdDialog>
        </View>
      </View>
    </Screen>
  );
};

export default BoostLuck;
