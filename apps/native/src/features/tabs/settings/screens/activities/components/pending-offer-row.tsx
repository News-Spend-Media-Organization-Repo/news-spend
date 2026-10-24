import type { PendingOffer } from "@news-spend-media/api/lib/pendingOffers";
import { format } from "date-fns/format";
import { PressableFeedback } from "heroui-native/pressable-feedback";
import { cn } from "heroui-native/utils";
import React from "react";
import { View } from "react-native";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { ClockIcon, WarningIcon } from "#/lib/icons";
import { toInstant } from "#/utils/toInstant";

type PendingOfferRowProps = {
  offer: PendingOffer;
  onPress: (offer: PendingOffer) => void;
};

export const pendingOfferDetail = (offer: PendingOffer) => {
  if (offer.state === "not_confirmed") {
    return "The partner has not confirmed this offer. Contact support if you completed it.";
  }
  const partner = offer.partnerName ?? "the partner";
  const days = offer.expectedWithinDays;
  return `Waiting for ${partner} to confirm. This usually takes up to ${days} ${days === 1 ? "day" : "days"}.`;
};

export const pendingOfferMeta = (offer: PendingOffer) =>
  offer.state === "not_confirmed"
    ? { bg: "#FFE4E6", icon: WarningIcon, label: "Not confirmed" }
    : { bg: "#FEF3C7", icon: ClockIcon, label: "Pending" };

export const PendingOfferRow = React.memo(
  ({ offer, onPress }: PendingOfferRowProps) => {
    const meta = pendingOfferMeta(offer);
    const notConfirmed = offer.state === "not_confirmed";

    return (
      <PressableFeedback onPress={() => onPress(offer)}>
        <View className="flex-row items-center gap-3 bg-surface px-4 py-3">
          <View
            className="size-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: meta.bg }}
          >
            <Icon color="#000" name={meta.icon} size={20} />
          </View>

          <View className="flex-1">
            <Text className="font-medium text-sm" numberOfLines={1}>
              {offer.title}
            </Text>
            <Text className="text-secondary text-xs">
              {format(toInstant(offer.clickedAt), "dd MMM · hh:mm a")}
            </Text>
            <Text
              className={cn(
                "font-medium text-xs",
                notConfirmed ? "text-danger" : "text-warning"
              )}
            >
              {meta.label}
            </Text>
          </View>

          {offer.points > 0 && (
            <Text
              className={cn(
                "font-semibold text-sm",
                notConfirmed ? "text-secondary" : "text-warning"
              )}
            >
              +{offer.points} pts
            </Text>
          )}
        </View>
      </PressableFeedback>
    );
  }
);

PendingOfferRow.displayName = "PendingOfferRow";
