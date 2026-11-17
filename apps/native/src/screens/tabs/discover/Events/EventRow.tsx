import { format } from "date-fns/format";
import { PressableFeedback } from "heroui-native/pressable-feedback";
import { View } from "react-native";
import { Image } from "#/components/heroui/image";
import { Text } from "#/components/heroui/text";
import type { RouterOutputs } from "#/lib/orpc";
import { toInstant } from "#/utils/toInstant";

export type EventRowEvent = RouterOutputs["events"]["list"]["data"][number];

type EventRowProps = {
  event: EventRowEvent;
  onPress: () => void;
};

/** Minor units are kobo; the app shows whole naira. */
export function formatNaira(minor: number): string {
  return `₦${Math.round(minor / 100).toLocaleString("en-NG")}`;
}

/** Whether the event can still be bought: Shows sales flag and its end time. */
function hasEnded(event: EventRowEvent, now = Date.now()): boolean {
  if (!event.onSale) {
    return true;
  }
  if (!event.endsAt) {
    return false;
  }
  const ends = toInstant(event.endsAt);
  return Number.isFinite(ends.getTime()) && ends.getTime() < now;
}

export function EventRow({ event, onPress }: EventRowProps) {
  const start = toInstant(event.startsAt);
  const dateValid = Number.isFinite(start.getTime());
  const when = dateValid ? format(start, "d MMM · h:mm a") : "";
  const subtitle = [event.venue, when].filter(Boolean).join(" · ");

  return (
    <PressableFeedback onPress={onPress}>
      <View className="flex-row gap-3 border-gray-200 border-b px-3 py-3">
        <View className="size-16 items-center justify-center overflow-hidden rounded-lg bg-p-500">
          {event.imageUrl ? (
            <Image
              className="size-16 rounded-lg"
              contentFit="cover"
              source={{ uri: event.imageUrl }}
            />
          ) : dateValid ? (
            <>
              <Text className="font-bold text-lg text-white leading-none">
                {format(start, "d")}
              </Text>
              <Text className="text-white text-xs uppercase">
                {format(start, "MMM")}
              </Text>
            </>
          ) : null}
        </View>

        <View className="flex-1 justify-between">
          <View>
            <Text className="font-medium text-base" numberOfLines={2}>
              {event.title}
            </Text>
            <Text className="text-gray-50 text-sm" numberOfLines={1}>
              {subtitle}
            </Text>
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="font-semibold text-sm">
              {hasEnded(event)
                ? "Ended"
                : event.free
                  ? "Free"
                  : event.fromPriceMinor == null
                    ? null
                    : `From ${formatNaira(event.fromPriceMinor)}`}
            </Text>
            {event.pointsFrom > 0 ? (
              <View
                className="rounded-full bg-s-300 px-2 py-1"
                testID="event-points-pill"
              >
                <Text className="text-white text-xs">
                  {event.pointsFrom} points
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </PressableFeedback>
  );
}
