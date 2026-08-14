import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Card, PressableFeedback } from "heroui-native";
import { GiftIcon } from "phosphor-react-native";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import { ScreenHeader } from "#/components";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";

type Winning = {
  id: string;
  prizeName: string;
  tier: string;
  fulfilmentType: string;
  claimStatus: string;
  claimable: boolean;
  closedReason: string | null;
  closedMessage: string | null;
  underReview: boolean;
  awaitingVerification: boolean;
  claimDeadline: string | null;
};

/**
 * A short line telling the winner what, if anything, is theirs to do.
 *
 * Deliberately distinguishes "we are checking you" from "you have a step
 * left" — they look the same in the data (both stop a dispatch) but mean
 * opposite things to the person reading them.
 */
function statusLine(prize: Winning): { label: string; tone: string } {
  if (prize.claimStatus === "expired") {
    return {
      label: prize.closedMessage ?? "Claim window closed",
      tone: "muted",
    };
  }
  if (prize.claimStatus === "disqualified") {
    return { label: "No longer valid", tone: "muted" };
  }
  if (prize.claimStatus === "unclaimed" && !prize.claimable) {
    return {
      label: prize.closedMessage ?? "No longer claimable",
      tone: "muted",
    };
  }
  if (prize.claimStatus === "unclaimed") {
    const deadline = prize.claimDeadline
      ? `Claim within ${formatDistanceToNowStrict(new Date(prize.claimDeadline))}`
      : "Ready to claim";
    return { label: deadline, tone: "urgent" };
  }
  if (prize.underReview) {
    return { label: "Under review — nothing needed from you", tone: "muted" };
  }
  if (prize.awaitingVerification) {
    return { label: "Verify your identity to receive this", tone: "urgent" };
  }
  if (prize.claimStatus === "claimed") {
    return { label: "Claimed — on its way", tone: "good" };
  }
  return { label: prize.claimStatus, tone: "muted" };
}

const TONE_CLASS: Record<string, string> = {
  urgent: "text-p-500 font-semibold",
  good: "text-green-600",
  muted: "text-subtle-text",
};

/**
 * Everything this user has won, and what is left to do about it.
 *
 * This screen exists because a win used to live only inside a transient
 * dialog: dismiss it and there was nowhere to go. With a claim window that
 * closes after fourteen days — or the moment the next giveaway starts — a
 * prize with no permanent home is a prize people lose.
 */
const MyPrizes = () => {
  const navigation = useNavigation("MyPrizes");
  const { data, isPending, refetch, isRefetching } = useQuery(
    orpc.giveaway.winnings.queryOptions()
  );

  const prizes = (data ?? []) as Winning[];

  return (
    <Screen>
      <ScreenHeader title="My Prizes" />

      {isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-4 pb-8"
          refreshControl={
            <RefreshControl onRefresh={refetch} refreshing={isRefetching} />
          }
        >
          {prizes.length === 0 && (
            <View className="items-center gap-2 px-6 py-16">
              <Icon color="#94a3b8" name={GiftIcon} size={40} />
              <Text className="text-center font-semibold text-lg">
                No prizes yet
              </Text>
              <Text className="text-center text-subtle-text">
                Buy a ticket to enter the current giveaway. Anything you win
                will appear here.
              </Text>
            </View>
          )}

          {prizes.map((prize) => {
            const status = statusLine(prize);
            const actionable = prize.claimable || prize.awaitingVerification;

            return (
              <PressableFeedback
                key={prize.id}
                onPress={() => {
                  if (!actionable) {
                    return;
                  }
                  navigation.navigate("ClaimPrize", { winnerId: prize.id });
                }}
              >
                <Card className={actionable ? "" : "opacity-60"}>
                  <Card.Body className="gap-1">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="flex-1 font-semibold text-base">
                        {prize.prizeName}
                      </Text>
                      {prize.claimable && (
                        <View className="rounded-full bg-p-500 px-2.5 py-0.5">
                          <Text className="font-semibold text-white text-xs">
                            Claim
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className={`text-sm ${TONE_CLASS[status.tone]}`}>
                      {status.label}
                    </Text>
                  </Card.Body>
                </Card>
              </PressableFeedback>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
};

export default MyPrizes;
