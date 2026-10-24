import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { PendingOffer } from "@news-spend-media/api/lib/pendingOffers";
import { format } from "date-fns/format";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { cn } from "heroui-native/utils";
import { View } from "react-native";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { toInstant } from "#/utils/toInstant";
import { pendingOfferDetail, pendingOfferMeta } from "./pending-offer-row";

type PendingOfferSheetProps = {
  offer: PendingOffer | null;
  isOpen: boolean;
  onOpenChange: (val: boolean) => void;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-xl bg-surface p-3">
      <Text className="mb-1 font-semibold text-secondary text-xs uppercase">
        {label}
      </Text>
      <Text className="font-medium text-sm">{value}</Text>
    </View>
  );
}

function PendingOfferSheetContent({ offer }: { offer: PendingOffer }) {
  const meta = pendingOfferMeta(offer);
  const notConfirmed = offer.state === "not_confirmed";
  const clickedAt = toInstant(offer.clickedAt);

  return (
    <BottomSheetScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
    >
      <View className="mb-4 flex-row items-center gap-3">
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: meta.bg }}
        >
          <Icon color="#000" name={meta.icon} size={24} />
        </View>
        <View className="flex-1">
          <BottomSheet.Title
            className="font-semibold text-base"
            numberOfLines={2}
          >
            {offer.title}
          </BottomSheet.Title>
          <Text className="text-secondary text-xs">
            {offer.partnerName ?? "Partner offer"}
          </Text>
        </View>
      </View>

      {offer.points > 0 && (
        <View
          className={cn(
            "mb-4 flex-row items-center gap-3 rounded-2xl px-4 py-3",
            notConfirmed ? "bg-default" : "bg-warning-50"
          )}
        >
          <Text
            className={cn(
              "font-bold text-3xl tracking-tight",
              notConfirmed ? "text-secondary" : "text-warning-800"
            )}
          >
            +{offer.points}
          </Text>
          <Text
            className={cn(
              "font-medium text-sm",
              notConfirmed ? "text-secondary" : "text-warning-600"
            )}
          >
            {notConfirmed ? "points not credited" : "points once confirmed"}
          </Text>
        </View>
      )}

      <View className="gap-3">
        <View className="flex-row gap-2">
          <Field label="Status" value={meta.label} />
          <Field
            label="Expected within"
            value={`${offer.expectedWithinDays} ${offer.expectedWithinDays === 1 ? "day" : "days"}`}
          />
        </View>
        <View className="flex-row gap-2">
          <Field label="Date" value={format(clickedAt, "dd/MM/yyyy")} />
          <Field label="Time" value={format(clickedAt, "hh:mm a")} />
        </View>
        <View className="rounded-xl bg-surface p-3">
          <Text className="text-secondary text-sm leading-5">
            {pendingOfferDetail(offer)}
          </Text>
        </View>
      </View>
    </BottomSheetScrollView>
  );
}

export function PendingOfferSheet({
  offer,
  isOpen,
  onOpenChange,
}: PendingOfferSheetProps) {
  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal disableFullWindowOverlay={__DEV__}>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          contentContainerClassName="h-full"
          enableDynamicSizing={false}
          enableOverDrag={false}
          snapPoints={["55%", "85%"]}
        >
          {offer ? <PendingOfferSheetContent offer={offer} /> : null}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
