import { CommonActions, useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInDays, differenceInHours } from "date-fns";
import { Card } from "heroui-native/card";
import { CoinsIcon } from "#/lib/icons";
import { View } from "react-native";

import { ScreenHeader } from "#/components";
import { PartnerAdDialog } from "#/components/discover/PartnerAdDialog";
import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { toast } from "#/components/heroui/toast";
import { useFocusBackHandler } from "#/hooks/useBackHandler";
import { orpc } from "#/lib/orpc";

const BoostLuck = () => {
  const navigation = useNavigation("BoostLuck");
  const queryClient = useQueryClient();
  const { data } = useQuery(orpc.giveaway.progress.queryOptions());
  const boostLuckMutation = useMutation(
    orpc.giveaway.recordEngagement.mutationOptions({
      onSuccess: () => {
        /*
         * Confirms the boost landed without stating the running total.
         *
         * The tally used to be here, which put a count of how many times
         * someone had watched a sponsor onto a toast that floats over
         * whatever screen is open, including the one announcing a win. It
         * read as the app scoring their behaviour back at them. What a person
         * needs at this moment is only that the thing they just did counted.
         */
        toast.success("Luck Boosted!", {
          description: "Counted for this giveaway.",
        });
        queryClient.invalidateQueries({
          queryKey: orpc.giveaway.progress.queryKey(),
        });
      },
      onError: (error) => {
        // The engine explains refusals in terms the person can act on: buy a
        // ticket first, or this item has already counted, so show its words
        // rather than a generic failure.
        toast.error("That didn't count", { description: error.message });
      },
    })
  );

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

  /**
   * A Boost is recorded against the partner item that was watched.
   *
   * A Google ad arrives here with no item, because it has no partner-content
   * record for the engine to count against, and the engine deliberately
   * refuses an engagement it cannot attribute, since three boosts must mean
   * three different items rather than one watched three times. Saying so is
   * better than a silent no-op that leaves the counter stuck.
   */
  const onCountdownComplete = (ad?: { id: string }) => {
    if (!ad?.id) {
      toast.info("Watch a sponsor ad to earn a boost", {
        description: "That one doesn't count towards your entries.",
      });
      return;
    }

    boostLuckMutation.mutate({ type: "boost", contentId: ad.id });
  };

  /**
   * Once the boosts for the top tier are in, send people to the app wall,
   * which is where Featured Offers (the other half of Tier 1) come from.
   *
   * Counted from the server rather than a ref, because a ref resets every
   * time this screen unmounts: someone returning after three boosts used to
   * be offered a fourth that could never help them.
   */
  const onDialogOpen = () => {
    // Read from the API rather than hardcoded: the thresholds are platform
    // rules the server owns, and a copy here would drift the moment they move.
    const tier1 = data?.tiers?.find((t) => t.tier === "tier1");
    const boostsNeeded = tier1?.requirements?.primary?.boosts ?? 3;

    if ((data?.participation?.boosts ?? 0) >= boostsNeeded) {
      navigation.navigate("LuckyAppWall");
      return false;
    }
    return true;
  };

  const now = new Date();

  /**
   * The giveaway's own end date, not a guessed fortnight.
   *
   * This used to compute the next Monday and add a week, which was the
   * lottery's fixed cadence. A giveaway's window is set per giveaway by an
   * administrator, so a countdown derived from the calendar would disagree
   * with the one on every other screen.
   */
  const endDate = data?.endDate ? new Date(data.endDate) : null;
  const daysLeft = endDate ? differenceInDays(endDate, now) : 0;
  const hoursLeft = endDate ? differenceInHours(endDate, now) : 0;

  let timeLeft: string;
  if (!endDate) {
    timeLeft = "no giveaway running";
  } else if (daysLeft > 1) {
    timeLeft = `${daysLeft} days`;
  } else {
    timeLeft = `${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}`;
  }

  return (
    <Screen className="gap-4 pb-safe" statusBarStyle="light">
      <ScreenHeader
        right={
          <Text
            className="text-white"
            onPress={() => navigation.navigate("LotteryRules")}
          >
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
            Countdown: <Text className="text-lg text-p-500">{timeLeft}</Text>{" "}
            left
          </Text>
        </View>

        <Card className="rounded-md bg-s-300 p-0 px-6">
          <View className="min-h-18 flex-row items-center justify-between">
            <View className="items-center justify-center">
              <Text className="text-2xl">
                {data?.participation?.validTickets ?? 0}
              </Text>
              <Text>
                Ticket
                {(data?.participation?.validTickets ?? 0) === 1 ? "" : "s"}
              </Text>
            </View>

            <View className="mx-3.75 w-px self-stretch bg-gray-300" />

            <Button
              className="h-auto"
              onPress={() => navigation.navigate("GetTicket")}
              variant="ghost"
            >
              <Button.Label className="text-p-400 underline">
                Get more entries
              </Button.Label>
            </Button>
          </View>
        </Card>

        <View className="gap-4">
          <Text className="text-center">Our sponsors wish you good luck.</Text>

          {/*
            Pinned to in-house content, because this is the one surface whose
            purpose is earning a Boost.

            The rotation is otherwise 40% partner / 60% Google, and a Google ad
            cannot earn a Boost at all: it has no partner-content record for
            the engine to attribute one to, so it is refused. Left sampling,
            roughly three in five attempts here spent fifteen seconds to earn
            nothing, or bounced the person to the Lucky App Wall instead. The
            Google inventory still runs everywhere else.
          */}
          <PartnerAdDialog
            asChild
            // Skip anything whose Boost is already earned: a repeat here
            // costs a full advertisement and is then refused.
            forBoost
            onCountdownComplete={onCountdownComplete}
            onOpen={onDialogOpen}
            preferAdType="custom"
          >
            <Button className="w-full flex-row items-center justify-center gap-2 rounded-lg bg-p-400 px-4 py-3">
              <CoinsIcon color="white" size={20} />
              <Button.Label className="font-semibold text-white">
                Boost Your Entries
              </Button.Label>
            </Button>
          </PartnerAdDialog>
        </View>
      </View>
    </Screen>
  );
};

export default BoostLuck;
