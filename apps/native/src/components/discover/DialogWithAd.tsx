import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog } from "heroui-native/dialog";
import { useEffect, useId, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  useWindowDimensions,
  View,
} from "react-native";
import {
  NativeAd,
  NativeAdEventType,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from "react-native-google-mobile-ads";
import { Button } from "#/components/heroui/button";
import { Image } from "#/components/heroui/image";
import { Text } from "#/components/heroui/text";
import { toast } from "#/components/heroui/toast";
import { useGlobalBackHandler } from "#/hooks/useBackHandler";
import { adUnits } from "#/lib/adUnits";
import { XIcon } from "#/lib/icons";
import { orpc, type RouterOutputs } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { getCtaLabel } from "#/utils";
import { getImageData } from "#/utils/getImageData";

/** What the server says was actually bought, at what price, and what it unlocked. */
type BuyTicketsResult = RouterOutputs["giveaway"]["buyTickets"];

export function DialogWithAd({
  open,
  setOpen,
  purchasedTickets,
  preloadedNativeAd,
  onPurchased,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  purchasedTickets: number;
  preloadedNativeAd?: NativeAd | null;
  onPurchased?: () => void;
}) {
  const { width } = useWindowDimensions();
  const id = useId();
  const queryOptions = orpc.partnerContent.getOne.queryOptions({
    input: {
      // placement: ["connect-brands-tab"],
      type: ["app", "book", "product", "game"],
    },
  });
  const queryKey = [...queryOptions.queryKey, id];
  const ad = useQuery({
    ...queryOptions,
    queryKey,
  });
  const lotteryTicketMutation = useMutation(
    orpc.giveaway.buyTickets.mutationOptions()
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const navigation = useNavigation("GetTicket");
  const [randomNumber, setRandomNumber] = useState(Math.random());
  const { url, blurhash } = getImageData(ad.data?.media);
  const hasAwardedRef = useRef(false);

  /**
   * Whether the purchase has actually been dispatched.
   *
   * The mutation is fired from an effect, so on the first render after the
   * dialog opens the mutation is still `idle` — `isPending` is false and
   * `serverError` is null, which is byte-for-byte the same state as "your
   * tickets are bought". That is what made a successful purchase look like
   * nothing happened: the success copy was on screen before the request left
   * the device. This flag is set in the same tick as `mutate`, so React batches
   * it with the mutation's own move to `pending` and there is no frame where
   * the dialog claims success it has not got.
   */
  const [submitted, setSubmitted] = useState(false);

  useGlobalBackHandler(() => {
    if (open) {
      return true;
    }

    return false;
  });

  useEffect(() => {
    if (!open || hasAwardedRef.current) {
      return;
    }

    hasAwardedRef.current = true;

    setServerError(null);
    setSubmitted(true);
    lotteryTicketMutation.mutate(
      {
        quantity: purchasedTickets,
      },
      {
        onSuccess: (result) => {
          toast.success("Giveaway entry confirmed", {
            description: `You entered the Giveaway with ${result.quantity} ticket${
              result.quantity === 1 ? "" : "s"
            }`,
          });

          /**
           * Points, the tier ladder and the entrant list all move on a
           * purchase. Refetching rather than patching a cached count: the
           * server decides how many tickets were actually valid, and the
           * tier a purchase unlocks is its answer to give, not ours.
           */
          queryClient.invalidateQueries(
            orpc.activity.totalPoints.queryOptions()
          );
          queryClient.invalidateQueries({
            queryKey: orpc.giveaway.progress.queryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: orpc.giveaway.participants.queryKey(),
          });

          onPurchased?.();
        },
        onError: ({ message }) => {
          // The API explains refusals in terms a winner can act on (an empty
          // giveaway, too few points), so show it rather than a generic line.
          setServerError(message || "Sorry, something went wrong.");
        },
      }
    );
  }, [open, purchasedTickets, lotteryTicketMutation.mutate, onPurchased]);

  const onOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      hasAwardedRef.current = false;
      // Cleared on close, not just on submit: otherwise reopening the dialog
      // renders one frame with the previous attempt's result still in place —
      // a failed purchase would reopen on its own success copy, before the new
      // request had even been dispatched.
      setSubmitted(false);
      setServerError(null);
    }
    setOpen(nextOpen);

    if (!nextOpen) {
      setRandomNumber(Math.random());
    }
  };

  const handlePress = () => {
    const urlToOpen =
      Platform.select({
        ios: ad.data?.links?.iosAppStore,
        android: ad.data?.links?.androidPlayStore,
      }) ?? ad.data?.links?.website;

    if (!urlToOpen) {
      toast.error("No link available for this ad.");
      return;
    }
    Linking.openURL(urlToOpen).catch((err) => {
      console.error("Failed to open URL:", err);
      toast.error("Failed to open the link.");
    });
  };

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-black/50" isCloseOnPress={false} />
        <Dialog.Content
          className="rounded-none p-0 px-2 pb-8"
          isSwipeable={false}
          style={{ width: width - 40, minHeight: 80 }}
        >
          <View className="gap-4">
            {randomNumber < 0.4 ? (
              <>
                <Text className="mt-2 self-start rounded-sm border border-gray-50 px-0.5 text-gray-50">
                  AD
                </Text>

                <View className="flex-row items-center gap-2 pl-3">
                  <Image
                    className="size-7.5"
                    contentFit="cover"
                    placeholder={{ blurhash }}
                    source={url}
                  />
                  <Text className="font-semibold text-base">
                    {ad.data?.title}
                  </Text>
                </View>

                <View className="items-center">
                  <Image
                    className="size-50"
                    contentFit="cover"
                    placeholder={{ blurhash }}
                    source={url}
                  />
                </View>

                <View className="flex-row gap-4">
                  <Text
                    className="flex-2 text-base text-gray-50"
                    numberOfLines={2}
                  >
                    {ad.data?.condition}
                  </Text>

                  <Button
                    className="h-auto flex-1 rounded-lg"
                    onPress={handlePress}
                  >
                    <Button.Label>Visit</Button.Label>
                  </Button>
                </View>
              </>
            ) : (
              <NativeAdMob preloadedAd={preloadedNativeAd} />
            )}

            <View className="mt-2 items-center gap-2.5">
              {randomNumber < 0.4 ? (
                <Text className="text-center text-sm">
                  {getCtaLabel(ad.data?.cta)} and Get{" "}
                  <Text className="text-s-500">{ad.data?.points ?? 0}</Text>{" "}
                  points
                </Text>
              ) : null}

              <PurchaseStatus
                error={serverError}
                isPending={lotteryTicketMutation.isPending}
                requestedTickets={purchasedTickets}
                result={lotteryTicketMutation.data}
                submitted={submitted}
              />
            </View>
          </View>

          {lotteryTicketMutation.isSuccess ? (
            <Button
              className="mt-4 h-12.5 w-full rounded-lg"
              onPress={() => {
                onOpenChange(false);
                // `GetTicket` and `BoostLuck` are both root-stack routes, so
                // this replaces the ticket screen with the boost screen. The
                // old code reset to `DiscoverHome`, which lives under
                // `Tab > Discover` and is not a route on this navigator at all.
                navigation.replace("BoostLuck");
              }}
            >
              <Button.Label>Continue</Button.Label>
            </Button>
          ) : (
            <Button
              aria-label="Close"
              className="absolute -bottom-7 z-10 h-9 w-9 items-center justify-center self-center rounded-full border border-gray-50 bg-white"
              onPress={() => onOpenChange(false)}
              variant="ghost"
            >
              <XIcon color="#9CA3AF" size={20} weight="bold" />
            </Button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

/**
 * The three states a purchase can be in, in the order the user meets them.
 *
 * Before, a single branch covered "not pending" and printed the success copy —
 * so the dialog announced a confirmed entry before the request had been sent,
 * and looked identical afterwards. Nothing ever visibly changed on success.
 */
function PurchaseStatus({
  submitted,
  isPending,
  result,
  error,
  requestedTickets,
}: {
  submitted: boolean;
  isPending: boolean;
  result: BuyTicketsResult | undefined;
  error: string | null;
  requestedTickets: number;
}) {
  if (error) {
    return <Text className="text-center text-sm">{error}</Text>;
  }

  if (!submitted || isPending) {
    return (
      <View className="items-center gap-2">
        <ActivityIndicator className="self-center" />
        <Text className="text-center text-s-500 text-sm">
          Confirming your entry…
        </Text>
      </View>
    );
  }

  // The server is the authority on what was actually bought and at what price.
  //
  // `quantity` is what this purchase bought; `validTickets` is the running
  // total the reader now holds. The line below says "added", so it needs the
  // first — quoting the total read as "3 tickets added" for a one-ticket
  // purchase. The total gets its own sentence, where it reads correctly.
  const bought = result?.quantity ?? requestedTickets;
  const held = result?.validTickets;

  return (
    <View className="items-center gap-1.5">
      <Text className="text-center font-semibold text-base">
        You&apos;re in the Giveaway!
      </Text>
      <Text className="text-center text-sm">
        {bought} ticket{bought === 1 ? "" : "s"} added.{" "}
        <Text className="text-s-500">{result?.pointsSpent ?? 0}</Text> Dream
        Points deducted.
      </Text>
      {typeof held === "number" ? (
        <Text className="text-center text-s-500 text-xs">
          You now hold {held} ticket{held === 1 ? "" : "s"} in this draw.
        </Text>
      ) : null}
    </View>
  );
}

const NativeAdMob = ({ preloadedAd }: { preloadedAd?: NativeAd | null }) => {
  const [error, setError] = useState(false);
  const [nativeAd, setNativeAd] = useState<NativeAd | undefined>(
    preloadedAd ?? undefined
  );

  useEffect(() => {
    if (preloadedAd) {
      setNativeAd(preloadedAd);
      return;
    }

    NativeAd.createForAdRequest(adUnits.native)
      .then((ad) => {
        setNativeAd(ad);
      })
      .catch(() => {
        setError(true);
      });
  }, [preloadedAd]);

  useEffect(() => {
    if (!nativeAd || nativeAd === preloadedAd) {
      return;
    }
    const _listener = nativeAd.addAdEventListener(
      NativeAdEventType.CLICKED,
      () => {
        console.log("Native ad clicked");
      }
    );
    return () => {
      nativeAd.destroy();
    };
  }, [nativeAd, preloadedAd]);

  if (!nativeAd) {
    return (
      <View className="py-3">
        {error ? <Text>Failed to load ad</Text> : null}
      </View>
    );
  }

  return (
    <NativeAdView nativeAd={nativeAd}>
      <View className="gap-4">
        <View className="my-2">
          <Text className="mt-2 self-start rounded-sm border border-gray-50 px-0.5 text-gray-50">
            AD
          </Text>
        </View>

        <View className="flex-row items-center gap-2 pl-3">
          {nativeAd.icon ? (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image
                className="size-7.5"
                contentFit="cover"
                source={{ uri: nativeAd.icon?.url }}
              />
            </NativeAsset>
          ) : null}

          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text className="font-semibold text-base">{nativeAd.headline}</Text>
          </NativeAsset>
        </View>

        <NativeMediaView
          style={{
            paddingHorizontal: 16,
          }}
        />

        <View className="flex-row gap-4">
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text className="flex-2 text-base text-gray-50" numberOfLines={2}>
              {nativeAd.body}
            </Text>
          </NativeAsset>

          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Button size="sm">
              <Button.Label>{nativeAd.callToAction}</Button.Label>
            </Button>
          </NativeAsset>
        </View>
      </View>
    </NativeAdView>
  );
};
