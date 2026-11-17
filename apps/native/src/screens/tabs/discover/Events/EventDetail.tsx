import { useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns/format";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { ScreenHeader } from "#/components";
import { Button } from "#/components/heroui/button";
import { Image } from "#/components/heroui/image";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";
import { toInstant } from "#/utils/toInstant";
import { formatNaira } from "./EventRow";

const day = (value: string) => format(toInstant(value), "EEE d MMM");
const time = (value: string) => format(toInstant(value), "h:mm a");

export function EventDetailScreen() {
  const { id } = useRoute("EventDetail").params;
  const [sessionId, setSessionId] = useState<string | null>(null);

  const eventQuery = useQuery(orpc.events.get.queryOptions({ input: { id } }));
  const event = eventQuery.data;
  const selectedSessionId = sessionId ?? event?.sessions[0]?.id ?? null;

  const inventoryQuery = useQuery({
    ...orpc.events.inventory.queryOptions({
      input: { eventId: id, sessionId: selectedSessionId ?? undefined },
    }),
    enabled: event !== undefined,
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
  const inventory = inventoryQuery.data;

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
                  onPress={() => setSessionId(session.id)}
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

        <View className="border-gray-200 border-t">
          <Text className="px-4 py-3 font-semibold text-base">Tickets</Text>

          {inventoryQuery.isPending ? (
            <View className="items-center py-4">
              <ActivityIndicator />
            </View>
          ) : inventoryQuery.isError ? (
            <Text className="px-4 pb-4 text-gray-50 text-sm">
              Prices are unavailable right now.
            </Text>
          ) : inventory && inventory.tiers.length > 0 ? (
            inventory.tiers.map((tier) => {
              const soldOut =
                tier.soldOut || (tier.available != null && tier.available <= 0);
              return (
                <View
                  className="flex-row items-center justify-between border-gray-200 border-t px-4 py-3"
                  key={tier.id}
                >
                  <View className="flex-1">
                    <Text className="font-medium text-sm">
                      {tier.name ?? "Ticket"}
                    </Text>
                    <Text className="text-gray-50 text-xs">
                      {soldOut
                        ? "Sold out"
                        : tier.available == null
                          ? "Available"
                          : `${tier.available} left`}
                    </Text>
                  </View>
                  <Text className="font-semibold text-sm">
                    {formatNaira(tier.priceMinor)}
                  </Text>
                </View>
              );
            })
          ) : (
            <Text className="px-4 pb-4 text-gray-50 text-sm">
              {inventory?.soldOut ? "Sold out" : "No tickets on sale yet."}
            </Text>
          )}
        </View>

        {event.pointsFrom > 0 ? (
          <View className="mx-4 mt-4 rounded-lg bg-s-75 px-3 py-2">
            <Text className="text-sm">
              Earn about {event.pointsFrom} Dream Points with this ticket.
            </Text>
          </View>
        ) : null}

        <View className="px-4 pt-6">
          <Button isDisabled>
            <Button.Label>Continue</Button.Label>
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}
