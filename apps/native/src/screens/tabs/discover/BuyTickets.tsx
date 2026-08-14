import { isInferableError } from "@orpc/client";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Card, cn, PressableFeedback } from "heroui-native";
import { MinusCircleIcon, PlusCircleIcon } from "phosphor-react-native";
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { toast } from "sonner-native";

import { ScreenHeader } from "#/components";
import DateOfBirthDialog from "#/components/dialogs/DateOfBirthDialog";
import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";

const MAX_PER_PURCHASE = 100;

const TIER_LABEL: Record<string, string> = {
  tier1: "Tier 1 · Top prizes",
  tier2: "Tier 2 · Mid prizes",
  tier3: "Tier 3 · Everyday prizes",
};

type TierRow = {
  tier: string;
  requirementsMet: boolean;
  canWin: boolean;
  cooldown: { rule: string; reason: string } | null;
  loyaltyWaiver: boolean;
  requirements: {
    primary: { tickets: number; boosts: number; featuredOffers: number };
  };
};

/**
 * One tier's requirements against what this user has actually done.
 *
 * Shown because tickets alone rarely decide anything above Tier 3 — someone
 * can buy twenty and still be short a Boost. Saying which part is missing is
 * the difference between "buy more" and "buy more of the right thing".
 */
function TierProgress({
  row,
  have,
}: {
  row: TierRow;
  have: { validTickets: number; boosts: number; featuredOffers: number };
}) {
  const need = row.requirements.primary;

  const parts = [
    { label: "tickets", has: have.validTickets, needs: need.tickets },
    { label: "boosts", has: have.boosts, needs: need.boosts },
    {
      label: "offers",
      has: have.featuredOffers,
      // §22.4 — the loyalty waiver drops this requirement for one round.
      needs: row.loyaltyWaiver ? 0 : need.featuredOffers,
    },
  ].filter((p) => p.needs > 0);

  return (
    <Card>
      <Card.Body className="gap-2">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 font-semibold text-sm">
            {TIER_LABEL[row.tier] ?? row.tier}
          </Text>
          {row.canWin && (
            <View className="rounded-full bg-green-100 px-2.5 py-0.5">
              <Text className="font-semibold text-green-700 text-xs">
                Eligible
              </Text>
            </View>
          )}
        </View>

        {parts.length === 0 ? (
          <Text className="text-subtle-text text-xs">
            One ticket is all this tier asks for.
          </Text>
        ) : (
          <View className="flex-row flex-wrap gap-x-4 gap-y-1">
            {parts.map((p) => (
              <Text
                className={cn(
                  "text-xs",
                  p.has >= p.needs ? "text-green-600" : "text-subtle-text"
                )}
                key={p.label}
              >
                {Math.min(p.has, p.needs)}/{p.needs} {p.label}
              </Text>
            ))}
          </View>
        )}

        {row.loyaltyWaiver && (
          <Text className="text-p-500 text-xs">
            Featured Offer waived this round — thanks for sticking with it.
          </Text>
        )}

        {/*
         * A cooldown is not something buying more tickets can fix, so it is
         * said separately from the requirements above rather than mixed in
         * with them.
         */}
        {row.cooldown && (
          <Text className="text-xs text-yellow-700">{row.cooldown.reason}</Text>
        )}
      </Card.Body>
    </Card>
  );
}

/** The stepper, the price, and the button that spends points. */
function PurchaseCard({
  quantity,
  minimum,
  cost,
  balance,
  canAfford,
  isBuying,
  isLoadingBalance,
  onQuantityChange,
  onBuy,
}: {
  quantity: number;
  minimum: number;
  cost: number;
  balance: number;
  canAfford: boolean;
  isBuying: boolean;
  isLoadingBalance: boolean;
  onQuantityChange: (update: (value: number) => number) => void;
  onBuy: () => void;
}) {
  return (
    <Card>
      <Card.Body className="gap-4">
        <View className="flex-row items-center justify-center gap-6">
          <PressableFeedback
            onPress={() => onQuantityChange((v) => Math.max(minimum, v - 1))}
          >
            <MinusCircleIcon
              color={quantity <= minimum ? "#cbd5e1" : "#1a1a2e"}
              size={32}
            />
          </PressableFeedback>

          <View className="items-center">
            <Text className="font-extrabold text-3xl">{quantity}</Text>
            <Text className="text-subtle-text text-xs">
              ticket{quantity === 1 ? "" : "s"}
            </Text>
          </View>

          <PressableFeedback
            onPress={() =>
              onQuantityChange((v) => Math.min(MAX_PER_PURCHASE, v + 1))
            }
          >
            <PlusCircleIcon
              color={quantity >= MAX_PER_PURCHASE ? "#cbd5e1" : "#1a1a2e"}
              size={32}
            />
          </PressableFeedback>
        </View>

        <View className="items-center gap-0.5">
          <Text className="font-semibold">{cost} points</Text>
          <Text
            className={cn(
              "text-xs",
              canAfford ? "text-subtle-text" : "text-danger"
            )}
          >
            You have {balance} points
          </Text>
        </View>

        {minimum > 1 && (
          <Text className="text-center text-subtle-text text-xs">
            This giveaway has a minimum of {minimum} tickets per purchase.
          </Text>
        )}

        <Button
          isDisabled={!canAfford || isBuying || isLoadingBalance}
          onPress={onBuy}
        >
          <Button.Label>{isBuying ? "Buying…" : "Buy tickets"}</Button.Label>
          {isBuying && (
            <ActivityIndicator className="ml-2" color="#fff" size="small" />
          )}
        </Button>
      </Card.Body>
    </Card>
  );
}

/**
 * Buy tickets for the open giveaway (spec §6).
 *
 * Separate from the legacy lottery's Get Ticket screen, which buys into a
 * different draw entirely. This one enforces the giveaway's own minimum, shows
 * how each purchase moves the user towards a tier, and handles the age gate:
 * participation is 18+, so someone with no date of birth on record is asked
 * for one here rather than being refused at the point of paying.
 */
const BuyTickets = () => {
  const navigation = useNavigation("BuyTickets");
  const [rawQuantity, setQuantity] = useState(1);
  const [dobOpen, setDobOpen] = useState(false);

  const giveaway = useQuery(orpc.giveaway.current.queryOptions());
  const points = useQuery(orpc.activity.totalPoints.queryOptions());

  const hasGiveaway = Boolean(giveaway.data);
  const progress = useQuery(
    orpc.giveaway.progress.queryOptions({ enabled: hasGiveaway })
  );

  const price = giveaway.data?.ticketPrice ?? 0;
  const minimum = giveaway.data?.minTicketsRequired ?? 1;

  /**
   * Clamped on read rather than synced with an effect. The minimum arrives
   * with the giveaway, after this state initialises, so a stepper starting at
   * one would sit below a minimum of five and fail the moment it was used.
   */
  const quantity = Math.max(rawQuantity, minimum);
  const cost = quantity * price;
  const balance = points.data ?? 0;
  const canAfford = balance >= cost;

  const buy = useMutation(
    orpc.giveaway.buyTickets.mutationOptions({
      onSuccess: (result) => {
        toast.success("You're in!", {
          description: `${result.quantity} ticket${result.quantity === 1 ? "" : "s"} bought for ${result.pointsSpent} points.`,
        });
        queryClient.invalidateQueries({
          queryKey: orpc.giveaway.progress.key(),
        });
        queryClient.invalidateQueries(orpc.activity.totalPoints.queryOptions());
        setQuantity(minimum);
      },
      onError: (error) => {
        if (!isInferableError(error)) {
          toast.error("Could not buy tickets.");
          return;
        }

        // The API refuses anyone without a date of birth on record. Rather
        // than surface that as a failure, ask for the missing piece.
        if (
          error.code === "FORBIDDEN" &&
          progress.data?.blockedReason === "no_date_of_birth"
        ) {
          setDobOpen(true);
          return;
        }

        toast.error(error.message);
      },
    })
  );

  const blockedReason = progress.data?.blockedReason ?? null;
  const isUnderAge = blockedReason === "under_age";

  if (giveaway.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Buy Tickets" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (!hasGiveaway) {
    return (
      <Screen>
        <ScreenHeader title="Buy Tickets" />
        <View className="flex-1 items-center justify-center gap-2 px-8">
          <Text className="text-center font-semibold text-lg">
            No giveaway running
          </Text>
          <Text className="text-center text-subtle-text">
            There's no giveaway open right now. Check back soon.
          </Text>
        </View>
      </Screen>
    );
  }

  const closesIn = giveaway.data?.endDate
    ? formatDistanceToNowStrict(new Date(giveaway.data.endDate))
    : null;

  return (
    <Screen>
      <ScreenHeader
        right={
          <Text
            className="text-white"
            onPress={() => navigation.navigate("MyPrizes")}
          >
            My Prizes
          </Text>
        }
        title="Buy Tickets"
      />

      <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
        <View className="items-center gap-1 pt-2">
          <Text className="font-semibold text-lg">{giveaway.data?.name}</Text>
          {closesIn && (
            <Text className="text-sm text-subtle-text">
              Closes in {closesIn}
            </Text>
          )}
        </View>

        {isUnderAge ? (
          <Card>
            <Card.Body className="gap-1">
              <Text className="font-semibold">Not available to you yet</Text>
              <Text className="text-sm text-subtle-text">
                {progress.data?.blockedMessage}
              </Text>
            </Card.Body>
          </Card>
        ) : (
          <PurchaseCard
            balance={balance}
            canAfford={canAfford}
            cost={cost}
            isBuying={buy.isPending}
            isLoadingBalance={points.isPending}
            minimum={minimum}
            onBuy={() => buy.mutate({ quantity })}
            onQuantityChange={setQuantity}
            quantity={quantity}
          />
        )}

        {progress.data && !isUnderAge && (
          <View className="gap-2">
            <Text className="font-semibold text-subtle-text text-xs tracking-wide">
              WHERE YOU STAND
            </Text>
            {(progress.data.tiers as TierRow[]).map((row) => (
              <TierProgress
                have={progress.data.participation}
                key={row.tier}
                row={row}
              />
            ))}
            <Text className="text-subtle-text text-xs">
              Every valid ticket is one entry in the draw — more tickets, better
              odds. Boosts and Featured Offers unlock the higher tiers.
            </Text>
          </View>
        )}
      </ScrollView>

      <DateOfBirthDialog
        onOpenChange={setDobOpen}
        onSaved={() => buy.mutate({ quantity })}
        open={dobOpen}
      />
    </Screen>
  );
};

export default BuyTickets;
