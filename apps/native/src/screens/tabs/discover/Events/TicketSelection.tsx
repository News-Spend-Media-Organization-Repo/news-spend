import { Pressable, View } from "react-native";
import { Text } from "#/components/heroui/text";
import { formatNaira } from "./EventRow";

/** v1 sells at most four of one tier per order. */
const MAX_PER_TYPE = 4;

export type TicketTier = {
  id: string;
  name: string | null;
  priceMinor: number;
  available: number | null;
  soldOut: boolean;
};

export type TicketChoice = {
  tierId: string;
  quantity: number;
};

export function tierQuantityLimit(tier: TicketTier) {
  return Math.min(MAX_PER_TYPE, tier.available ?? MAX_PER_TYPE);
}

export function tierAvailable(tier: TicketTier) {
  return !tier.soldOut && (tier.available == null || tier.available > 0);
}

type Props = {
  tiers: TicketTier[];
  choice: TicketChoice | null;
  onChange: (choice: TicketChoice) => void;
};

/**
 * The tier list and its quantity stepper. Kept out of `EventDetail` so that
 * screen stays a reader of event data rather than a form.
 */
export function TicketSelection({ tiers, choice, onChange }: Props) {
  return (
    <View>
      {tiers.map((tier) => {
        const selected = choice?.tierId === tier.id;
        const available = tierAvailable(tier);

        return (
          <View className="border-gray-200 border-t" key={tier.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !available, selected }}
              className={
                selected
                  ? "flex-row items-center justify-between bg-p-50 px-4 py-3"
                  : "flex-row items-center justify-between px-4 py-3"
              }
              disabled={!available}
              onPress={() =>
                onChange({
                  tierId: tier.id,
                  // Re-tapping the chosen tier keeps its quantity.
                  quantity: selected && choice ? choice.quantity : 1,
                })
              }
            >
              <View className="flex-1">
                <Text className="font-medium text-sm">
                  {tier.name ?? "Ticket"}
                </Text>
                <Text className="text-gray-50 text-xs">
                  {available
                    ? tier.available == null
                      ? "Available"
                      : `${tier.available} left`
                    : "Sold out"}
                </Text>
              </View>
              <Text className="font-semibold text-sm">
                {formatNaira(tier.priceMinor)}
              </Text>
            </Pressable>

            {selected && choice ? (
              <View className="flex-row items-center gap-4 px-4 pb-3">
                <Pressable
                  accessibilityLabel="Fewer tickets"
                  accessibilityRole="button"
                  disabled={choice.quantity <= 1}
                  onPress={() =>
                    onChange({
                      tierId: tier.id,
                      quantity: Math.max(1, choice.quantity - 1),
                    })
                  }
                >
                  <Text className="font-semibold text-lg">−</Text>
                </Pressable>
                <Text className="font-semibold text-sm">{choice.quantity}</Text>
                <Pressable
                  accessibilityLabel="More tickets"
                  accessibilityRole="button"
                  disabled={choice.quantity >= tierQuantityLimit(tier)}
                  onPress={() =>
                    onChange({
                      tierId: tier.id,
                      quantity: Math.min(
                        tierQuantityLimit(tier),
                        choice.quantity + 1
                      ),
                    })
                  }
                >
                  <Text className="font-semibold text-lg">+</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
