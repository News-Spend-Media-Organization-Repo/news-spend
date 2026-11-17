import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns/format";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSnapshot } from "valtio";
import { ScreenHeader } from "#/components";
import { Button } from "#/components/heroui/button";
import { Image } from "#/components/heroui/image";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";
import { authState } from "#/state/auth";
import { toInstant } from "#/utils/toInstant";
import { formatNaira } from "./EventRow";
import {
  type TicketChoice,
  TicketSelection,
  type TicketTier,
  tierAvailable,
  tierQuantityLimit,
} from "./TicketSelection";

const day = (value: string) => format(toInstant(value), "EEE d MMM");
const time = (value: string) => format(toInstant(value), "h:mm a");

/** Where Shows sends the browser back to after a successful checkout. */
const orderUrl = (reference: string) =>
  `https://link.newsspend.com/events/order/${reference}`;

type CheckoutArgs = {
  eventId: string;
  session: { id: string; revision: string | null } | undefined;
  choice: TicketChoice | null;
  tier: TicketTier | undefined;
  soldOut: boolean;
};

/**
 * The checkout action, kept apart from the screen's rendering so the detail
 * component stays small. A guest is sent to the root stack's sign-in and comes
 * back here; a signed-in buyer opens Shows' hosted checkout.
 */
function useEventCheckout({
  eventId,
  session,
  choice,
  tier,
  soldOut,
}: CheckoutArgs) {
  const navigation = useNavigation("EventDetail");
  // Sign-in lives in the root stack; this screen's own navigator only has the
  // Discover screens and Order.
  const rootNavigation = useNavigation();
  const { user } = useSnapshot(authState);
  const [notice, setNotice] = useState<string | null>(null);
  const startCheckout = useMutation(orpc.events.checkout.mutationOptions());

  const canContinue =
    choice !== null &&
    tier !== undefined &&
    tierAvailable(tier) &&
    choice.quantity <= tierQuantityLimit(tier) &&
    !soldOut &&
    session?.revision != null;

  const onContinue = async () => {
    if (!(choice && tier && session?.revision)) {
      return;
    }

    if (!user || user.isAnonymous) {
      rootNavigation.navigate("SignIn", { redirect: true });
      return;
    }

    setNotice(null);
    try {
      const checkout = await startCheckout.mutateAsync({
        eventId,
        sessionId: session.id,
        sessionRevision: session.revision,
        tickets: [{ type: choice.tierId, quantity: choice.quantity }],
      });
      // The reference is a URL segment in the return link; encode it once and
      // use the same value for the route param.
      const reference = encodeURIComponent(checkout.reference);
      const result = await WebBrowser.openAuthSessionAsync(
        checkout.checkoutUrl,
        orderUrl(reference),
        // Without this Expo treats the https callback as a custom scheme,
        // which can never match the link.newsspend.com universal link.
        { preferUniversalLinks: true }
      );
      if (result.type === "success") {
        navigation.navigate("Order", { reference });
        return;
      }
      setNotice("Checkout closed. You can try again whenever you're ready.");
    } catch {
      setNotice("We couldn't start checkout. Please try again.");
    }
  };

  return {
    canContinue,
    notice,
    onContinue,
    resetNotice: () => setNotice(null),
    starting: startCheckout.isPending,
  };
}

type TicketsSectionProps = {
  inventory: { tiers: TicketTier[]; soldOut: boolean } | undefined;
  pending: boolean;
  error: boolean;
  choice: TicketChoice | null;
  onChange: (choice: TicketChoice) => void;
};

function TicketsSection({
  inventory,
  pending,
  error,
  choice,
  onChange,
}: TicketsSectionProps) {
  return (
    <View className="border-gray-200 border-t">
      <Text className="px-4 py-3 font-semibold text-base">Tickets</Text>

      {pending ? (
        <View className="items-center py-4">
          <ActivityIndicator />
        </View>
      ) : error ? (
        <Text className="px-4 pb-4 text-gray-50 text-sm">
          Prices are unavailable right now.
        </Text>
      ) : inventory && inventory.tiers.length > 0 ? (
        <TicketSelection
          choice={choice}
          onChange={onChange}
          tiers={inventory.tiers}
        />
      ) : (
        <Text className="px-4 pb-4 text-gray-50 text-sm">
          {inventory?.soldOut ? "Sold out" : "No tickets on sale yet."}
        </Text>
      )}
    </View>
  );
}

export function EventDetailScreen() {
  const { id } = useRoute("EventDetail").params;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [choice, setChoice] = useState<TicketChoice | null>(null);

  const eventQuery = useQuery(orpc.events.get.queryOptions({ input: { id } }));
  const event = eventQuery.data;
  const selectedSessionId = sessionId ?? event?.sessions[0]?.id ?? null;
  const selectedSession = event?.sessions.find(
    (candidate) => candidate.id === selectedSessionId
  );

  const inventoryQuery = useQuery({
    ...orpc.events.inventory.queryOptions({
      input: {
        eventId: id,
        sessionId: selectedSessionId ?? undefined,
        revision: selectedSession?.revision ?? undefined,
      },
    }),
    enabled: event !== undefined,
  });
  const inventory = inventoryQuery.data;
  const selectedTier = inventory?.tiers.find(
    (tier) => tier.id === choice?.tierId
  );
  const { canContinue, notice, onContinue, resetNotice, starting } =
    useEventCheckout({
      eventId: id,
      session: selectedSession,
      choice,
      tier: selectedTier,
      soldOut: inventory?.soldOut === true,
    });

  if (eventQuery.isPending) {
    return (
      <Screen statusBarStyle="light">
        <ScreenHeader title="Event" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen statusBarStyle="light">
        <ScreenHeader title="Event" />
        <View className="flex-1 items-center justify-center gap-2 px-6">
          <Text className="font-semibold text-lg">Event not found</Text>
          <Text className="text-center text-sm text-subtle-text">
            This event may no longer be on sale.
          </Text>
        </View>
      </Screen>
    );
  }

  const startsAt = toInstant(event.startsAt);

  return (
    <Screen statusBarStyle="light">
      <ScreenHeader title="Event" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {event.imageUrl ? (
          <Image
            className="w-full"
            contentFit="cover"
            source={{ uri: event.imageUrl }}
            style={{ aspectRatio: 16 / 9 }}
          />
        ) : (
          <View className="w-full items-center justify-center bg-p-500 py-10">
            <Text className="font-bold text-4xl text-white">
              {format(startsAt, "d")}
            </Text>
            <Text className="text-base text-white uppercase">
              {format(startsAt, "MMMM")}
            </Text>
          </View>
        )}

        <View className="gap-1 px-4 py-4">
          <Text className="font-semibold text-xl">{event.title}</Text>
          {event.venue || event.city ? (
            <Text className="text-gray-50 text-sm">
              {[event.venue, event.city].filter(Boolean).join(", ")}
            </Text>
          ) : null}
          <Text className="text-sm">
            {format(startsAt, "EEEE d MMMM · h:mm a")}
          </Text>
          {event.description ? (
            <Text className="pt-2 text-sm">{event.description}</Text>
          ) : null}
        </View>

        {event.sessions.length > 0 ? (
          <View className="border-gray-200 border-t">
            <Text className="px-4 py-3 font-semibold text-base">Sessions</Text>
            {event.sessions.map((session) => {
              const selected = session.id === selectedSessionId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={
                    selected
                      ? "border-p-500 border-l-4 bg-p-50 px-4 py-3"
                      : "border-transparent border-l-4 px-4 py-3"
                  }
                  key={session.id}
                  onPress={() => {
                    setSessionId(session.id);
                    setChoice(null);
                    resetNotice();
                  }}
                >
                  <Text className="font-medium text-sm">
                    {day(session.startsAt)} · {time(session.startsAt)}
                  </Text>
                  {session.fromPriceMinor == null ? null : (
                    <Text className="text-gray-50 text-xs">
                      From {formatNaira(session.fromPriceMinor)}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <TicketsSection
          choice={choice}
          error={inventoryQuery.isError}
          inventory={inventory}
          onChange={setChoice}
          pending={inventoryQuery.isPending}
        />

        {event.pointsFrom > 0 ? (
          <View className="mx-4 mt-4 rounded-lg bg-s-75 px-3 py-2">
            <Text className="text-sm">
              Earn about {event.pointsFrom} Dream Points with this ticket.
            </Text>
          </View>
        ) : null}

        <View className="gap-2 px-4 pt-6">
          {notice ? (
            <Text className="text-center text-sm text-subtle-text">
              {notice}
            </Text>
          ) : null}
          <Button isDisabled={!canContinue || starting} onPress={onContinue}>
            <Button.Label>Continue</Button.Label>
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}
