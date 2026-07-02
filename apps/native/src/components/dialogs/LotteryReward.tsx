import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog } from "heroui-native";
import { StarIcon } from "phosphor-react-native";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRewardedAd } from "react-native-google-mobile-ads";
import { toast } from "sonner-native";
import { useSnapshot } from "valtio";
import { PartnerAdDialog } from "#/components/discover/PartnerAdDialog";
import { Button } from "#/components/heroui/button";
import { adUnits } from "#/lib/adUnits";
import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { authState } from "#/state/auth";
import { Icon } from "../heroui/icon";
import { Text } from "../ui";

export default memo(function LotteryReward() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showPrize, setShowPrize] = useState(false);
  const [connectBrandOpen, setConnectBrandOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { session } = useSnapshot(authState);
  const user = session?.user;

  const { data, isPending } = useQuery(
    orpc.lottery.getReward.queryOptions({
      enabled: Boolean(user),
    })
  );

  const { isLoaded, isClosed, load, show, isEarnedReward } = useRewardedAd(
    adUnits.rewarded
  );

  const claimRewardMutation = useMutation(
    orpc.lottery.claimReward.mutationOptions({
      onSuccess: () => {
        if (!data?.prize) {
          return;
        }

        if (data.prizeTier === "LOW") {
          toast.success("Reward claimed!", {
            description: `${data.prize} Dream Points added!`,
          });
          queryClient.invalidateQueries(
            orpc.activity.totalPoints.queryOptions()
          );
        } else {
          toast.success("Reward claimed!", {
            description: `You claimed ${data.prize}! Please verify your identity to finish up.`,
          });
        }
        queryClient.setQueryData(
          orpc.lottery.getReward.queryKey(undefined),
          (oldData) => ({
            ...oldData,
            claimed: true,
          })
        );
      },
      onError: () => {
        toast.error("Failed to claim reward!");
        setShowPrize(false);
      },
    })
  );

  useEffect(() => {
    if (data && !isPending && user) {
      timeoutRef.current = setTimeout(() => {
        setDialogOpen(true);
      }, 5000);
      load();

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }
  }, [data, isPending, user, load]);

  useEffect(() => {
    if (isClosed && isEarnedReward) {
      setShowPrize(true);
      handleClaim();
    }
  }, [isClosed, isEarnedReward, handleClaim]);

  const handleClaim = useCallback(() => {
    if (!data || claimRewardMutation.isPending) {
      return;
    }
    claimRewardMutation.mutate({ winnerId: data.id });
  }, [data, claimRewardMutation]);

  const handleClose = () => {
    setDialogOpen(false);
    setShowPrize(false);
    if (data?.prize) {
      queryClient.invalidateQueries(orpc.lottery.getReward.queryOptions());
    } else {
      handleClaim();
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const handleClaimReward = () => {
    if (claimRewardMutation.isPending) {
      return;
    }
    if (isLoaded) {
      show();
    } else {
      setConnectBrandOpen(true);
    }
  };

  const handleVerifyIdentity = () => {
    setDialogOpen(false);
    handleClose();
  };

  return (
    <>
      <Dialog
        isOpen={dialogOpen}
        onOpenChange={(openVal) => {
          setDialogOpen(openVal);
          if (!openVal) {
            handleClose();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content className="w-[95%]">
            <Dialog.Close className="absolute top-1 right-2" variant="ghost" />

            {data?.prize && showPrize && (
              <View className="items-center gap-2">
                <Icon color="#00223d" name={StarIcon} size={48} weight="fill" />
                <View
                  className="rounded-full px-2.5 py-0.5"
                  style={{ backgroundColor: "#F7E0C0" }}
                >
                  <Text className="text-center font-extrabold text-[#A57D47]">
                    {`${data.prize} ${data.prizeTier === "LOW" ? "Dream Points" : ""}`}
                  </Text>
                </View>
                <Text className="text-center font-semibold text-lg">
                  Congratulations!
                </Text>
                <Text className="text-center text-subtle-text">
                  You won {data.prize}{" "}
                  {data.prizeTier === "LOW" ? "Dream Points" : ""} in the
                  Giveaway.
                </Text>
              </View>
            )}
            {data?.prize && !showPrize && (
              <View className="items-center gap-2">
                <Text className="text-center font-semibold text-lg">
                  Congratulations!
                </Text>
                <Text className="text-center text-subtle-text">
                  You have won a prize from the Giveaway.
                </Text>
              </View>
            )}
            {!data?.prize && (
              <View className="items-center gap-2">
                <Text className="text-center font-semibold text-lg">
                  Better luck next time!
                </Text>
                <Text className="text-center text-subtle-text">
                  Unfortunately, you didn't win any prizes this time. Keep
                  participating for more chances to win!
                </Text>
              </View>
            )}

            {data?.prize && !showPrize && (
              <Button
                className="mt-4"
                isDisabled={claimRewardMutation.isPending}
                onPress={handleClaimReward}
              >
                <Button.Label>
                  {claimRewardMutation.isPending
                    ? "Claiming Reward..."
                    : "Claim your prize"}
                </Button.Label>
                {claimRewardMutation.isPending && (
                  <ActivityIndicator
                    className="ml-2"
                    color="#fff"
                    size="small"
                  />
                )}
              </Button>
            )}

            {data?.prize && showPrize && data.prizeTier !== "LOW" && (
              <Button className="mt-4" onPress={handleVerifyIdentity}>
                <Button.Label>Verify your Identity</Button.Label>
              </Button>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      <PartnerAdDialog
        fallbackToAppWall={false}
        hideTrigger
        onCountdownComplete={() => {
          setShowPrize(true);
          handleClaim();
        }}
        open={connectBrandOpen}
        setOpen={setConnectBrandOpen}
      />
    </>
  );
});
