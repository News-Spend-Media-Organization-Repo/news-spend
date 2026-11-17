import { isDefinedError, type ORPCError } from "@orpc/client";
import { useIsFocused, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns/format";
import { useEffect, useRef } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { ScreenHeader } from "#/components";
import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { trackDiscover } from "#/lib/discoverAnalyticsClient";
import { orpc, type RouterOutputs } from "#/lib/orpc";
import { toInstant } from "#/utils/toInstant";
import { formatNaira } from "./EventRow";

/** The order is read every five seconds while Shows is still confirming it. */
const POLL_MS = 5000;

type Order = RouterOutputs["events"]["order"];

/**
 * Copy for the states that end the order without tickets. `pending`, `paid`
 * and `refunded` carry details of their own and are rendered separately.
 */
const CLOSED_COPY = {
  expired: {
    title: "This checkout expired",
    body: "No payment was taken. Pick another ticket to try again.",
  },
  cancelled: {
    title: "This order was cancelled",
    body: "No payment was taken.",
  },
  failed: {
    title: "This payment did not go through",
    body: "No tickets were issued. You can try again from the event.",
  },
} as const;

function closedCopy(state: Order["state"]) {
  return state === "expired" || state === "cancelled" || state === "failed"
    ? CLOSED_COPY[state]
    : null;
}

/** First-load failure: not-found only when the API said so. */
function OrderLoadFailure({
  error,
  onRetry,
}: {
  error: Error | ORPCError<string, unknown> | null;
  onRetry: () => void;
}) {
  const notFound = isDefinedError(error) && error.code === "NOT_FOUND";

  return (
    <View className="flex-1 items-center justify-center gap-2 px-6">
      <Text className="font-semibold text-lg">
        {notFound ? "Order not found" : "We couldn't load this order"}
      </Text>
      <Text className="text-center text-sm text-subtle-text">
        {notFound
          ? "This order may belong to another account."
          : "Check your connection and try again."}
      </Text>
      {notFound ? null : (
        <Button className="mt-2" onPress={onRetry}>
          <Button.Label>Retry</Button.Label>
        </Button>
      )}
    </View>
  );
}

export function OrderScreen() {
  const { reference } = useRoute("Order").params;
  const isFocused = useIsFocused();
  const orderQuery = useQuery(
    orpc.events.order.queryOptions({ input: { reference } })
  );
  const order = orderQuery.data;
  const pending = order?.state === "pending";
  const { refetch } = orderQuery;
  const tracked = useRef(false);

  // Poll while Shows is confirming, but only while this screen is the one
  // being looked at: a background poll burns the order rate limit for nothing.
  useEffect(() => {
    if (!(pending && isFocused)) {
      return;
    }
    const interval = setInterval(() => {
      refetch();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [pending, isFocused, refetch]);

  useEffect(() => {
    if (order?.state !== "paid" || tracked.current) {
      return;
    }
    tracked.current = true;
    // The analytics enum has no dedicated `event_paid` type yet, so the paid
    // order is recorded as an event open against its reference.
    trackDiscover({
      event: "open",
      itemType: "event",
      itemId: order.reference,
      section: "events",
    });
  }, [order?.state, order?.reference]);

  if (orderQuery.isPending) {
    return (
      <Screen statusBarStyle="light">
        <ScreenHeader title="Order" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  // A failed poll must not replace an order already on screen; only a
  // first-load failure with nothing to show falls back to the error state.
  if (!order) {
    return (
      <Screen statusBarStyle="light">
        <ScreenHeader title="Order" />
        <OrderLoadFailure
          error={orderQuery.error}
          onRetry={() => orderQuery.refetch()}
        />
      </Screen>
    );
  }

  const closed = closedCopy(order.state);

  return (
    <Screen statusBarStyle="light">
      <ScreenHeader title="Order" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View className="gap-1 px-4 py-4">
          <Text className="font-semibold text-xl">
            {order.eventName ?? "Your order"}
          </Text>
          <Text className="text-gray-50 text-xs">Ref {order.reference}</Text>
        </View>

        {order.state === "pending" ? (
          <View className="items-center gap-2 px-6 py-10">
            <ActivityIndicator />
            <Text className="text-center font-semibold text-lg">
              Confirming your payment with Shows
            </Text>
            <Text className="text-center text-sm text-subtle-text">
              This screen updates on its own. You can leave it open.
            </Text>
          </View>
        ) : null}

        {order.state === "paid" ? (
          <View className="gap-3 px-4">
            <Text className="font-semibold text-lg">
              Your tickets are confirmed
            </Text>

            {order.sessionAt ? (
              <Text className="text-sm">
                {format(toInstant(order.sessionAt), "EEEE d MMMM · h:mm a")}
              </Text>
            ) : null}

            <View className="border-gray-200 border-t">
              {order.items.map((item) => (
                <View
                  className="flex-row items-center justify-between border-gray-200 border-b py-2"
                  key={item.type}
                >
                  <Text className="text-sm">
                    {item.quantity} × {formatNaira(item.unitPriceMinor)}
                  </Text>
                  <Text className="font-semibold text-sm">
                    {formatNaira(item.unitPriceMinor * item.quantity)}
                  </Text>
                </View>
              ))}
            </View>

            <View className="flex-row items-center justify-between">
              <Text className="font-semibold text-sm">Total</Text>
              <Text className="font-semibold text-sm">
                {formatNaira(order.amountMinor ?? 0)}
              </Text>
            </View>

            {order.pointsAwarded > 0 ? (
              <View className="rounded-lg bg-s-75 px-3 py-2">
                <Text className="font-semibold text-s-500">
                  +{order.pointsAwarded} Dream Points
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {order.state === "refunded" ? (
          <View className="gap-2 px-4">
            <Text className="font-semibold text-lg">
              This order was refunded
            </Text>
            {order.refundedMinor > 0 ? (
              <Text className="font-semibold text-s-500">
                Refunded {formatNaira(order.refundedMinor)}
              </Text>
            ) : null}
            <Text className="text-sm text-subtle-text">
              The tickets on this order are no longer valid.
            </Text>
          </View>
        ) : null}

        {closed ? (
          <View className="gap-2 px-4">
            <Text className="font-semibold text-lg">{closed.title}</Text>
            <Text className="text-sm text-subtle-text">{closed.body}</Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
