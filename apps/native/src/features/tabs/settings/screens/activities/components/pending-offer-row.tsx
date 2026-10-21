import type { PendingOffer } from "@news-spend-media/api/lib/pendingOffers";
import React from "react";
import { View } from "react-native";
import { Text } from "#/components/heroui/text";

type PendingOfferRowProps = {
  offer: PendingOffer;
};

export const pendingOfferMessage = (offer: PendingOffer) => {
  if (offer.state === "not_confirmed") {
    return `Not confirmed: ${offer.title}. Contact support if you completed it.`;
  }
  const partner = offer.partnerName ?? "the partner";
  const days = offer.expectedWithinDays;
  return `Pending: ${offer.title}, waiting for ${partner} to confirm. Usually within ${days} ${days === 1 ? "day" : "days"}.`;
};

export const PendingOfferRow = React.memo(({ offer }: PendingOfferRowProps) => (
  <View className="bg-surface px-4 py-3">
    <Text className="text-secondary text-sm">{pendingOfferMessage(offer)}</Text>
  </View>
));

PendingOfferRow.displayName = "PendingOfferRow";
