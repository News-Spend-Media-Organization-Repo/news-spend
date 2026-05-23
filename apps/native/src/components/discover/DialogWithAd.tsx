import { useNavigation } from "@react-navigation/native";
import { X } from "@tamagui/lucide-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Linking, Platform, Text as RNText, useWindowDimensions } from "react-native";
import {
  NativeAd,
  NativeAdEventType,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from "react-native-google-mobile-ads";
import { toast } from "sonner-native";
import { AlertDialog, getTokens, Spinner, Stack, Text, Unspaced, XStack } from "tamagui";

import { adUnits } from "#/lib/adUnits";
import { Button, Image } from "#/components/ui";
import { useGlobalBackHandler } from "#/hooks/useBackHandler";
import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { getCtaLabel } from "#/utils";
import { getImageData } from "#/utils/getImageData";

export function DialogWithAd({
  open,
  setOpen,
  purchasedTickets,
  preloadedNativeAd,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  purchasedTickets: number;
  preloadedNativeAd?: NativeAd | null;
}) {
  const { width, height } = useWindowDimensions();
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
  const lotteryTicketMutation = useMutation(orpc.lotteryTicket.create.mutationOptions());
  const [serverError, setServerError] = useState<string | null>(null);
  const navigation = useNavigation("GetTicket");
  const [randomNumber, setRandomNumber] = useState(Math.random());
  const { url, blurhash } = getImageData(ad.data?.media);
  const hasAwardedRef = useRef(false);

  useGlobalBackHandler(() => {
    if (open) {
      return true;
    }

    return false;
  });

  useEffect(() => {
    if (!open || hasAwardedRef.current) return;

    hasAwardedRef.current = true;

    setServerError(null);
    lotteryTicketMutation.mutate(
      {
        num_of_tickets: purchasedTickets,
      },
      {
        onSuccess: () => {
          toast.success("Lottery ticket purchase", {
            description: `You purchased ${purchasedTickets} tickets`,
          });

          queryClient.invalidateQueries(orpc.activity.totalPoints.queryOptions());
          queryClient.invalidateQueries({
            queryKey: orpc.lotteryTicket.getByUser.queryKey(),
          });

          queryClient.setQueryData(orpc.lotteryTicket.getByUser.key(), (previousPoints) => {
            if (previousPoints) {
              return {
                ...previousPoints,
                lottery_tickets: {
                  ...previousPoints.lottery_tickets,
                  count: Number(previousPoints.lottery_tickets.count) + purchasedTickets,
                },
              };
            }

            return {
              lottery_tickets: {
                count: purchasedTickets,
              },
            };
          });
        },
        onError: ({ data, message }) => {
          setServerError("Sorry, something went wrong.");
        },
      },
    );
  }, [open]);

  const onOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      hasAwardedRef.current = false;
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
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          animation="quick"
          bg="rgba(0,0,0,0.5)"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          key="overlay"
          opacity={0.8}
        />
        <AlertDialog.Content
          // bordered
          animation={[
            "quick",
            {
              opacity: {
                overshootClamping: true,
              },
            },
          ]}
          br="$0"
          elevate
          enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
          exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
          key="connectBrand-ad"
          // x={0}
          minHeight="$20"
          opacity={1}
          p="$0"
          pb="$8"
          // y={0}
          // fullscreen
          px="$2"
          scale={1}
          w={width - 40}
        >
          <Stack gap="$4">
            {randomNumber < 0.4 ? (
              <>
                <Text
                  alignSelf="flex-start"
                  boc="$gray.50"
                  br="$1"
                  bw={1}
                  color="$gray.50"
                  mt="$2"
                  px="$0.5"
                >
                  AD
                </Text>

                <XStack ai="center" gap="$2" pl="$3">
                  <Image
                    contentFit="cover"
                    height={30}
                    placeholder={{
                      blurhash,
                    }}
                    source={url}
                    width={30}
                  />
                  <Text fontWeight="600" fos="$5">
                    {ad.data?.title}
                  </Text>
                </XStack>

                <Stack ai="center">
                  <Image
                    contentFit="cover"
                    height={200}
                    placeholder={{
                      blurhash,
                    }}
                    source={url}
                    width={200}
                  />
                </Stack>

                <XStack gap="$4">
                  <Text color="$gray.50" flex={2} fontSize={16} numberOfLines={2}>
                    {ad.data?.condition}
                  </Text>

                  <Button
                    // minWidth="$11"
                    borderRadius="$5"
                    flex={1}
                    h="auto"
                    onPress={handlePress}
                  >
                    <Button.Text>Visit</Button.Text>
                  </Button>
                </XStack>
              </>
            ) : (
              <NativeAdMob preloadedAd={preloadedNativeAd} />
            )}
            <Unspaced>
              <Stack ai="center" gap="$2.5" mt="$2">
                {randomNumber < 0.4 ? (
                  <Text fos="$3" ta="center">
                    {getCtaLabel(ad.data?.cta)} and Get{" "}
                    <Text color="$s500">{ad.data?.points ?? 0}</Text> points
                  </Text>
                ) : null}

                {lotteryTicketMutation.isPending ? (
                  <Spinner als="center" />
                ) : (
                  <Text fos="$4" ta="center">
                    {serverError ? (
                      serverError
                    ) : (
                      <>
                        You purchased {purchasedTickets ?? 0} ticket
                        {purchasedTickets === 1 ? "" : "s"}.{" "}
                        <Text color="$s500">{(purchasedTickets ?? 0) * 50} points</Text> deducted
                        from your account.
                      </>
                    )}
                  </Text>
                )}
              </Stack>
            </Unspaced>
          </Stack>

          <Button
            als="center"
            boc="$gray.50"
            borderWidth={1.5}
            bottom="$-7"
            br="$9"
            disabled={lotteryTicketMutation.isPending}
            h={35}
            onPress={() => {
              onOpenChange(false);
              if (!serverError) {
                navigation.reset({
                  index: 0,
                  routes: [{ name: "BoostLuck" }],
                });
              }
            }}
            position="absolute"
            unstyled
            w={35}
          >
            <Button.Icon color="$gray.50">
              <X />
            </Button.Icon>
          </Button>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog>
  );
}

const NativeAdMob = ({ preloadedAd }: { preloadedAd?: NativeAd | null }) => {
  const [error, setError] = useState(false);
  const [nativeAd, setNativeAd] = useState<NativeAd | undefined>(preloadedAd ?? undefined);
  const tokens = getTokens();

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
    if (!nativeAd || nativeAd === preloadedAd) return;
    const listener = nativeAd.addAdEventListener(NativeAdEventType.CLICKED, () => {
      console.log("Native ad clicked");
    });
    return () => {
      nativeAd.destroy();
    };
  }, [nativeAd, preloadedAd]);

  if (!nativeAd) {
    return <Stack py="$3">{error ? <Text>Failed to load ad</Text> : null}</Stack>;
  }

  return (
    <NativeAdView nativeAd={nativeAd}>
      <Stack gap="$4">
        <Stack my="$2">
          <Text
            alignSelf="flex-start"
            boc="$gray.50"
            br="$1"
            bw={1}
            color="$gray.50"
            mt="$2"
            px="$0.5"
          >
            AD
          </Text>
        </Stack>

        <XStack ai="center" gap="$2" pl="$3">
          {nativeAd.icon ? (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image
                contentFit="cover"
                height={30}
                source={{ uri: nativeAd.icon?.url }}
                width={30}
              />
            </NativeAsset>
          ) : null}

          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text fontWeight="600" fos="$5">
              {nativeAd.headline}
            </Text>
          </NativeAsset>
        </XStack>

        <NativeMediaView
          style={{
            // minHeight: 200,
            // width: "100%",
            paddingHorizontal: 16,
          }}
        />

        <XStack gap="$4">
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text color="$gray.50" flex={2} fontSize={16} numberOfLines={2}>
              {nativeAd.body}
            </Text>
          </NativeAsset>

          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <RNText
              style={{
                color: "white",
                fontFamily: "Inter-Medium",
                backgroundColor: tokens.color.p300.val,
                paddingHorizontal: 28,
                paddingVertical: 14,
                borderRadius: 15,
              }}
            >
              {nativeAd.callToAction}
            </RNText>
          </NativeAsset>
        </XStack>
      </Stack>
    </NativeAdView>
  );
};
