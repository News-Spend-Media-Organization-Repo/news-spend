import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Card, cn, PressableFeedback } from "heroui-native";
import { GiftIcon } from "phosphor-react-native";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";

import { ScreenHeader } from "#/components";
import { Button } from "#/components/heroui/button";
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
  selectedAt: string | null;
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
    const on = prize.selectedAt
      ? ` · ${format(new Date(prize.selectedAt), "d MMM")}`
      : "";
    return { label: `Claimed${on}`, tone: "good" };
  }
  return { label: prize.claimStatus, tone: "muted" };
}

const TONE_CLASS: Record<string, string> = {
  urgent: "text-p-500 font-semibold",
  good: "text-green-600",
  muted: "text-subtle-text",
};

function PrizeCard({
  prize,
  compact,
  onPress,
}: {
  prize: Winning;
  compact?: boolean;
  onPress: () => void;
}) {
  const status = statusLine(prize);
  const actionable = prize.claimable || prize.awaitingVerification;

  return (
    <PressableFeedback onPress={actionable ? onPress : undefined}>
      <Card className={cn(!actionable && "opacity-60")}>
        <Card.Body className={cn("gap-1", compact && "gap-0.5 py-2.5")}>
          <View className="flex-row items-center justify-between gap-2">
            <Text
              className={cn(
                "flex-1 font-semibold text-base",
                compact && "font-medium text-sm"
              )}
            >
              {prize.prizeName}
            </Text>
            {prize.claimable && (
              <View className="rounded-full bg-p-500 px-2.5 py-0.5">
                <Text className="font-semibold text-white text-xs">Claim</Text>
              </View>
            )}
          </View>
          <Text
            className={cn(
              "text-sm",
              compact && "text-xs",
              TONE_CLASS[status.tone]
            )}
          >
            {status.label}
          </Text>
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}

/**
 * Everything this user has won, and what is left to do about it.
 *
 * Split into two lists rather than one, because they behave differently.
 * "Needs You" is bounded by each prize's own claim window — fourteen days, or
 * until the next giveaway starts — so it can never grow past a handful and is
 * fetched whole. "History" is everything that has already resolved, which
 * only ever grows, so it is the one that is paged.
 *
 * This screen exists because a win used to live only inside a transient
 * dialog: dismiss it and there was nowhere to go. With a window that closes
 * on its own, a prize with no permanent home is a prize people lose.
 */
const MyPrizes = () => {
  const navigation = useNavigation("MyPrizes");

  const needsYou = useQuery(orpc.giveaway.actionable.queryOptions());

  const {
    data,
    isPending: isHistoryPending,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(
    orpc.giveaway.history.infiniteOptions({
      input: (page: number | undefined) => ({ page: page ?? 1 }),
      initialPageParam: 1,
      getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    })
  );

  const history = (data?.pages.flatMap((p) => p.items) ?? []) as Winning[];
  const isPending = needsYou.isPending || isHistoryPending;

  if (isPending) {
    return (
      <Screen>
        <ScreenHeader title="My Prizes" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  const openClaim = (prize: Winning) =>
    navigation.navigate("ClaimPrize", { winnerId: prize.id });

  const actionablePrizes = (needsYou.data ?? []) as Winning[];
  const isEmpty = actionablePrizes.length === 0 && history.length === 0;

  return (
    <Screen>
      <ScreenHeader
        right={
          <Text
            className="text-white"
            onPress={() => navigation.navigate("BuyTickets")}
          >
            Buy tickets
          </Text>
        }
        title="My Prizes"
      />

      <FlatList
        contentContainerClassName="gap-2 px-4 pb-8"
        data={isEmpty ? [] : history}
        keyExtractor={(prize) => prize.id}
        ListEmptyComponent={
          <View className="items-center gap-2 px-6 py-16">
            <Icon color="#94a3b8" name={GiftIcon} size={40} />
            <Text className="text-center font-semibold text-lg">
              No prizes yet
            </Text>
            <Text className="text-center text-subtle-text">
              Buy a ticket to enter the current giveaway. Anything you win will
              appear here.
            </Text>
            <Button
              className="mt-2"
              onPress={() => navigation.navigate("BuyTickets")}
            >
              <Button.Label>Buy tickets</Button.Label>
            </Button>
          </View>
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator />
            </View>
          ) : null
        }
        ListHeaderComponent={
          isEmpty ? null : (
            <View className="gap-2">
              {actionablePrizes.length > 0 && (
                <View className="gap-2 pb-4">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-semibold text-subtle-text text-xs tracking-wide">
                      NEEDS YOU
                    </Text>
                    <View className="rounded-full bg-p-500 px-2 py-0.5">
                      <Text className="font-semibold text-white text-xs">
                        {actionablePrizes.length}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-subtle-text text-xs">
                    Never more than a handful — the window closes 14 days after
                    you win, or when the next giveaway starts.
                  </Text>
                  {actionablePrizes.map((prize) => (
                    <PrizeCard
                      key={prize.id}
                      onPress={() => openClaim(prize)}
                      prize={prize}
                    />
                  ))}
                </View>
              )}
              {history.length > 0 && (
                <Text className="font-semibold text-subtle-text text-xs tracking-wide">
                  HISTORY
                </Text>
              )}
            </View>
          )
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              needsYou.refetch();
              refetch();
            }}
            refreshing={isRefetching || needsYou.isRefetching}
          />
        }
        renderItem={({ item: prize }) => (
          <PrizeCard compact onPress={() => openClaim(prize)} prize={prize} />
        )}
      />
    </Screen>
  );
};

export default MyPrizes;
