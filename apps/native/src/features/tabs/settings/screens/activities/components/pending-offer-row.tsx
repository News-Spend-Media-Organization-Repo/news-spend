import type { PendingOffer } from "@news-spend-media/api/lib/pendingOffers";
import { format } from "date-fns/format";
import { cn } from "heroui-native/utils";
import React from "react";
import { View } from "react-native";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { ClockIcon, WarningIcon } from "#/lib/icons";
import { toInstant } from "#/utils/toInstant";

type PendingOfferRowProps = {
  offer: PendingOffer;
};

export const pendingOfferDetail = (offer: PendingOffer) => {
  if (offer.state === "not_confirmed") {
    return "Contact support if you completed it.";
  }
  const partner = offer.partnerName ?? "the partner";
  const days = offer.expectedWithinDays;
  return `Waiting for ${partner} to confirm. Usually within ${days} ${days === 1 ? "day" : "days"}.`;
};

export const PendingOfferRow = React.memo(({ offer }: PendingOfferRowProps) => {
  const notConfirmed = offer.state === "not_confirmed";

  return (
    <View className="flex-row items-center gap-3 bg-surface px-4 py-3">
      <View
        className="size-9 items-center justify-center rounded-xl"
        style={{ backgroundColor: notConfirmed ? "#FFE4E6" : "#FEF3C7" }}
      >
        <Icon
          color="#000"
          name={notConfirmed ? WarningIcon : ClockIcon}
          size={20}
        />
      </View>

      <View className="flex-1">
        <Text className="font-medium text-sm" numberOfLines={1}>
          {offer.title}
        </Text>
        <Text className="text-secondary text-xs">
          {format(toInstant(offer.clickedAt), "dd MMM · hh:mm a")}
        </Text>
        <Text className="text-secondary text-xs">
          {pendingOfferDetail(offer)}
        </Text>
      </View>

      <Text
        className={cn(
          "font-semibold text-sm",
          notConfirmed ? "text-danger" : "text-warning"
        )}
      >
        {notConfirmed ? "Not confirmed" : "Pending"}
      </Text>
    </View>
  );
});

PendingOfferRow.displayName = "PendingOfferRow";
