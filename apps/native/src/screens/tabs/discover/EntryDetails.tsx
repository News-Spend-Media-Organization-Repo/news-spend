import { useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns/format";
import { Card } from "heroui-native/card";
import { ActivityIndicator, View } from "react-native";

import { ScreenHeader } from "#/components";
import { entryTotals, OutcomeBadge } from "#/components/discover/EntryCard";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { TicketIcon } from "#/lib/icons";
import { orpc } from "#/lib/orpc";
import { toInstant } from "#/utils/toInstant";

/**
 * What each purchase row says about itself.
 *
 * The whole ticket lifecycle, spelled out rather than shown raw. "Reversed" and
 * "fraudulent" are not words to put in front of a reader without saying what
 * they mean for the points.
 */
const PURCHASE_STATUS: Record<string, string> = {
  valid: "Counted",
  cancelled: "Cancelled",
  refunded: "Refunded",
  reversed: "Reversed",
  unpaid: "Never paid",
  fraudulent: "",
};

/**
 * One entry, in depth.
 *
 * The list carries the totals; this carries what produced them. Somebody asking
 * "where did my 45 points go?" needs the individual purchases — when, how many,
 * at what price, and whether any of it came back — which is more than a row can
 * say.
 *
 * Deliberately not a second outcome screen. What happened is already on the
 * row; this exists for the arithmetic behind it.
 */
const EntryDetails = () => {
  const { giveawayId } = useRoute("EntryDetails").params;

  const { data, isPending } = useQuery(
    orpc.giveaway.participation.queryOptions({ input: { giveawayId } })
  );

  if (isPending) {
    return (
      <Screen statusBarStyle="light">
        <ScreenHeader title="Entry" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen statusBarStyle="light">
        <ScreenHeader title="Entry" />
        <View className="flex-1 items-center gap-2 px-6 py-16">
          <Icon color="#94a3b8" name={TicketIcon} size={40} />
          <Text className="text-center font-semibold text-lg">
            Entry not found
          </Text>
          <Text className="text-center text-subtle-text">
            This giveaway is not one you entered.
          </Text>
        </View>
      </Screen>
    );
  }

  const { giveaway, purchases, boosts, featuredOffers, won } = data;

  return (
    <Screen className="px-4" statusBarStyle="light">
      <ScreenHeader title="Entry" />

      <View className="gap-4 py-4">
        <Card className="rounded-xl border border-gray-400">
          <Card.Body className="gap-2">
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 font-semibold text-base">
                {giveaway.name}
              </Text>
              <OutcomeBadge outcome={data.outcome} />
            </View>

            {giveaway.endDate ? (
              <Text className="text-subtle-text text-xs">
                Closed {format(toInstant(giveaway.endDate), "d MMM yyyy")}
              </Text>
            ) : null}

            <Text className="text-sm">{entryTotals(data)}</Text>

            {won ? <Text className="text-sm">{won.prizeName}</Text> : null}

            {boosts > 0 || featuredOffers > 0 ? (
              <Text className="text-sm text-subtle-text">
                {[
                  boosts > 0
                    ? `${boosts} boost${boosts === 1 ? "" : "s"}`
                    : null,
                  featuredOffers > 0
                    ? `${featuredOffers} featured offer${featuredOffers === 1 ? "" : "s"}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ) : null}
          </Card.Body>
        </Card>

        <View className="gap-2">
          <Text className="font-semibold text-subtle-text text-xs tracking-wide">
            PURCHASES
          </Text>

          {purchases.map((purchase) => (
            <View
              className="flex-row items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5"
              key={purchase.id}
            >
              <View className="flex-1 gap-0.5">
                <Text className="text-sm">
                  {purchase.quantity} × {purchase.unitPrice} points
                </Text>
                {purchase.purchasedAt ? (
                  <Text className="text-subtle-text text-xs">
                    {format(toInstant(purchase.purchasedAt), "d MMM yyyy, p")}
                  </Text>
                ) : null}
              </View>

              <Text
                className={
                  purchase.status === "valid"
                    ? "text-sm"
                    : "text-sm text-subtle-text"
                }
              >
                {PURCHASE_STATUS[purchase.status] ?? purchase.status}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
};

export default EntryDetails;
