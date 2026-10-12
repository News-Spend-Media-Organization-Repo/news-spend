import { Card } from "heroui-native/card";
import { PressableFeedback } from "heroui-native/pressable-feedback";
import { cn } from "heroui-native/utils";
import { View } from "react-native";

import { Text } from "#/components/heroui/text";

/**
 * One giveaway a person bought a ticket into, as the API returns it.
 *
 * Shared by the list and the entry's own screen so the two cannot describe the
 * same thing differently.
 */
export type Participation = {
  giveaway: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    ticketPrice: number | string | null;
  };
  tickets: number;
  pointsSpent: number;
  purchasedAt: string | null;
  refunded: boolean;
  outcome: ParticipationOutcome;
  won: { id: string } | null;
};

export type ParticipationOutcome =
  | "in_progress"
  | "draw_under_way"
  | "won"
  | "not_selected"
  | "draw_failed"
  | "cancelled";

/**
 * What each outcome is called, and how it reads.
 *
 * "Not selected" is the one carrying the weight. It is the only place somebody
 * who entered and lost is ever told what happened, so it is phrased as a result
 * rather than as an absence — and kept out of a warning tone, which would imply
 * the reader had done something wrong.
 */
export const OUTCOME: Record<
  ParticipationOutcome,
  { label: string; chip: string; text: string }
> = {
  in_progress: { label: "In progress", chip: "bg-s-500", text: "text-white" },
  draw_under_way: { label: "Drawing", chip: "bg-s-500", text: "text-white" },
  won: { label: "Won", chip: "bg-p-400", text: "text-white" },
  not_selected: {
    label: "Not selected",
    chip: "bg-gray-100",
    text: "text-subtle-text",
  },
  /**
   * Not "Draw failed". That is the system narrating its own trouble, and next
   * to "400 points spent" it reads as something the reader did wrong — when
   * they did nothing but buy a ticket. What they need to know is that there is
   * no result to wait for. Hidden it must not be either: an entry left looking
   * pending has them waiting on a draw that is not coming.
   */
  draw_failed: {
    label: "No result",
    chip: "bg-gray-100",
    text: "text-subtle-text",
  },
  cancelled: {
    label: "Cancelled",
    chip: "bg-gray-100",
    text: "text-subtle-text",
  },
};

export function OutcomeBadge({
  outcome,
  className,
}: {
  outcome: ParticipationOutcome;
  className?: string;
}) {
  const tone = OUTCOME[outcome];

  return (
    <View className={cn("rounded-full px-2 py-0.5", tone.chip, className)}>
      <Text className={cn("font-semibold text-xs", tone.text)}>
        {tone.label}
      </Text>
    </View>
  );
}

/** "3 tickets · 15 points spent", phrased for both screens. */
export function entryTotals({ tickets, pointsSpent }: Participation) {
  return `${tickets} ticket${tickets === 1 ? "" : "s"} · ${pointsSpent} points spent`;
}

/**
 * One row in the entries list.
 *
 * The numbers are the point of the list. A ticket is a spend, and this is the
 * only place it is accounted for once the confirmation toast is gone — so what
 * it cost is stated rather than left to be inferred from the outcome.
 *
 * Tappable, because the row cannot say everything: where the points went, and
 * which prize a win points at, both live one level down.
 */
export function EntryCard({
  entry,
  onPress,
}: {
  entry: Participation;
  onPress?: () => void;
}) {
  return (
    <PressableFeedback onPress={onPress}>
      <Card className="rounded-xl border border-gray-400">
        <Card.Body className="gap-1.5">
          <View className="flex-row items-start justify-between gap-3">
            <Text className="flex-1 font-semibold text-base" numberOfLines={2}>
              {entry.giveaway.name}
            </Text>
            <OutcomeBadge outcome={entry.outcome} />
          </View>

          <Text className="text-sm text-subtle-text">{entryTotals(entry)}</Text>

          {/* Bought, then refunded in full. Said plainly rather than left as a
              pair of zeroes for the reader to interpret. */}
          {entry.refunded ? (
            <Text className="text-subtle-text text-xs">
              Refunded — no tickets held
            </Text>
          ) : null}
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
