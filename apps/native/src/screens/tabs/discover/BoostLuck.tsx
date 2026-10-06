import { CommonActions, useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInDays } from "date-fns/differenceInDays";
import { differenceInHours } from "date-fns/differenceInHours";
import { Card } from "heroui-native/card";
import { View } from "react-native";
import { ScreenHeader } from "#/components";
import { PartnerAdDialog } from "#/components/discover/PartnerAdDialog";
import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { toast } from "#/components/heroui/toast";
import { useFocusBackHandler } from "#/hooks/useBackHandler";
import { authClient } from "#/lib/authClient";
import { CoinsIcon } from "#/lib/icons";
import { orpc } from "#/lib/orpc";

const BoostLuck = () => {
  const navigation = useNavigation("BoostLuck");
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
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
   * A partner Boost is recorded against the item that was watched; a Google
   * one is not recorded from here at all.
   *
   * A Google ad arrives with no item, because it has no partner-content record
   * to attribute a Boost to. It still earns one — Google's own verification
   * callback tells the server the impression happened, which is the only
   * account of it the server will take, since this screen saying so would be
   * worth nothing. So there is deliberately no mutation on this branch: the
   * credit is already on its way by a route the app is not part of.
   *
   * The confirmation says as much rather than claiming the Boost has landed.
   * The callback usually arrives within seconds, but it is a separate network
   * hop that can be refused for reasons this screen cannot see, and promising
   * a result we have not been told is worse than a short wait.
   */
  const onCountdownComplete = (ad?: { id: string }) => {
    if (!ad?.id) {
      /*
       * Nobody to credit, so nothing was asked for.
       *
       * The verification options carry the account the Boost belongs to, and
       * without a session there are none to send: the ad plays on the general
       * unit and Google never calls us. This screen is reachable signed out,
       * including by deep link, so saying the Boost is on its way would be a
       * promise nothing is going to keep. The partner path already refuses
       * this out loud, from the server.
       */
      if (!session?.user) {
        toast.info("Sign in to earn boosts", {
          description: "That one couldn't be counted towards your entries.",
        });
        return;
      }

      toast.success("Luck Boosted!", {
        description: "Counting once our ad partner confirms it.",
      });
      queryClient.invalidateQueries({
        queryKey: orpc.giveaway.progress.queryKey(),
      });
      return;
    }

    boostLuckMutation.mutate({ type: "boost", contentId: ad.id });
  };

  /**
   * Boosts earned in the open giveaway, against the most any tier asks for.
   *
   * Both come from the server: the count is per giveaway and resets with it,
   * and the threshold is a platform rule the server owns, so a copy here would
   * drift the moment it moves.
   *
   * Neither the numbers nor the tier they come from are rendered. The app
   * deliberately says nothing to a reader about tiers, thresholds or their
   * progress towards one: these decide which state the screen is in and
   * nothing more.
   */
  const boostsDone = data?.participation?.boosts ?? 0;
  const boostsNeeded =
    data?.tiers?.find((t) => t.tier === "tier1")?.requirements?.primary
      ?.boosts ?? 3;
  const boostsComplete = boostsDone >= boostsNeeded;

  /**
   * Nothing left to watch, but the boosts are not in either.
   *
   * Each sponsor counts once per giveaway, so a person who has watched every
   * item available reaches this with the tier still out of reach. It used to
   * move them to the app wall in silence, which reads exactly like the ad
   * failing to load — the report that prompted this. Say why first.
   */
  const onAdsUnavailable = () => {
    toast.info("No new sponsor ads right now", {
      description:
        "Each sponsor counts once per giveaway, so check back as more are added.",
    });
    navigation.navigate("LuckyAppWall");
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
        title="Boost Your Luck"
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
            The button stays in both states. Once the top tier's boosts are
            in, another boost changes nothing, so the press says so and then
            moves to Featured Offers, instead of navigating away in silence
            (which read as the ad failing to load).
          */}
          {boostsComplete ? (
            <Button
              className="w-full flex-row items-center justify-center gap-2 rounded-lg bg-p-400 px-4 py-3"
              onPress={() => {
                toast.info("Your boosts are in", {
                  description:
                    "Featured Offers are another way to improve your entries.",
                });
                navigation.navigate("LuckyAppWall");
              }}
            >
              <CoinsIcon color="white" size={20} />
              <Button.Label className="font-semibold text-white">
                Boost Your Luck
              </Button.Label>
            </Button>
          ) : (
            /*
              Both kinds of advertisement earn a Boost here, so the rotation is
              left alone.

              This was pinned to partner inventory for a while, because a
              Google ad could not earn a Boost at all and roughly three in five
              attempts spent fifteen seconds to earn nothing. Pinning fixed
              that at the cost of capping Boost supply at however many Connect
              Brand campaigns happened to be live — and a Boost counts once per
              item, so under three distinct campaigns the top tier was
              unreachable by anyone. Google rewarded ads now earn a Boost
              through server-side verification, which removes the reason to
              pin.
            */
            <PartnerAdDialog
              asChild
              // The screen handles an empty rotation itself, with a reason.
              fallbackToAppWall={false}
              // Skip anything whose Boost is already earned: a repeat here
              // costs a full advertisement and is then refused. Also what
              // marks this as the surface where a Google reward is verified.
              forBoost
              onCountdownComplete={onCountdownComplete}
              onUnavailable={onAdsUnavailable}
            >
              <Button className="w-full flex-row items-center justify-center gap-2 rounded-lg bg-p-400 px-4 py-3">
                <CoinsIcon color="white" size={20} />
                <Button.Label className="font-semibold text-white">
                  Boost Your Luck
                </Button.Label>
              </Button>
            </PartnerAdDialog>
          )}
        </View>
      </View>
    </Screen>
  );
};

export default BoostLuck;
