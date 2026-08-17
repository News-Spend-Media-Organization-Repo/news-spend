import { isInferableError } from "@orpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog } from "heroui-native/dialog";
import { StarIcon } from "phosphor-react-native";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRewardedAd } from "react-native-google-mobile-ads";
import { useSnapshot } from "valtio";
import { PartnerAdDialog } from "#/components/discover/PartnerAdDialog";
import { Button } from "#/components/heroui/button";
import { toast } from "#/components/heroui/toast";
import { adUnits } from "#/lib/adUnits";
import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { navigate } from "#/navigation/navigationUtils";
import { authState } from "#/state/auth";
import { Icon } from "../heroui/icon";
import { Text } from "../ui";

// DEV-ONLY manual test harness. Stripped from release builds by __DEV__.
// Lets you seed fake reward data (no real winner row / winnerId needed) and
// simulate a successful claim locally, so the dialog states below can be
// tapped through on a real device. Remove once done testing.
type DevMockTier = "HIGH" | "LOW" | "NONE";
const DEV_MOCK_REWARDS: Record<
  Exclude<DevMockTier, "NONE">,
  { id: string; prize: string; prizeTier: "LOW" | "HIGH" }
> = {
  LOW: { id: "dev-mock-low", prize: "50", prizeTier: "LOW" },
  HIGH: { id: "dev-mock-high", prize: "iPhone 16 Pro", prizeTier: "HIGH" },
};

export default memo(function LotteryReward() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showPrize, setShowPrize] = useState(false);
  const [connectBrandOpen, setConnectBrandOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { session } = useSnapshot(authState);
  const user = session?.user;

  const [devMockTier, setDevMockTier] = useState<DevMockTier | null>(null);
  const [devClaimPending, setDevClaimPending] = useState(false);
  const isMocking = __DEV__ && devMockTier !== null;

  const realQuery = useQuery(
    orpc.lottery.getReward.queryOptions({
      enabled: Boolean(user) && !isMocking,
    })
  );

  const mockData =
    isMocking && devMockTier !== "NONE"
      ? { ...DEV_MOCK_REWARDS[devMockTier], claimed: false }
      : isMocking
        ? { id: "dev-mock-none", prize: null, prizeTier: null, claimed: false }
        : null;

  const data = isMocking ? mockData : realQuery.data;
  const isPending = isMocking ? false : realQuery.isPending;

  const { isLoaded, isClosed, load, show, isEarnedReward } = useRewardedAd(
    adUnits.rewarded
  );

  const applyClaimSuccessSideEffects = useCallback(() => {
    queryClient.setQueryData(
      orpc.lottery.getReward.queryKey(undefined),
      (oldData) => ({
        ...oldData,
        claimed: true,
      })
    );

    if (!data?.prize) {
      return;
    }

    if (data.prizeTier === "LOW") {
      toast.success("Reward claimed!", {
        description: `${data.prize} Dream Points added!`,
      });
      queryClient.invalidateQueries(orpc.activity.totalPoints.queryOptions());
    } else {
      toast.success("Reward claimed!", {
        description: `You claimed ${data.prize}! Please verify your identity to finish up.`,
      });
    }
  }, [data]);

  const claimRewardMutation = useMutation(
    orpc.lottery.claimReward.mutationOptions({
      onSuccess: applyClaimSuccessSideEffects,
      onError: (error) => {
        // CONFLICT means the backend's atomic claim check found this
        // reward already marked claimed — most likely this exact request
        // already succeeded once (e.g. a retry after a lost response) and
        // this is a duplicate, not a genuine failure. Treat it the same
        // as a success instead of surfacing an error toast.
        if (isInferableError(error) && error.code === "CONFLICT") {
          applyClaimSuccessSideEffects();
          return;
        }
        toast.error("Failed to claim reward!");
        setShowPrize(false);
      },
    })
  );

  const isClaimPending = isMocking
    ? devClaimPending
    : claimRewardMutation.isPending;

  const handleClaim = useCallback(() => {
    if (!data || isClaimPending) {
      return;
    }
    if (isMocking) {
      setDevClaimPending(true);
      setTimeout(() => {
        setDevClaimPending(false);
        applyClaimSuccessSideEffects();
      }, 800);
      return;
    }
    claimRewardMutation.mutate({ winnerId: data.id });
  }, [
    data,
    isClaimPending,
    isMocking,
    claimRewardMutation,
    applyClaimSuccessSideEffects,
  ]);

  // Keyed on data?.id (not `data`) so marking the reward `claimed` in the
  // cache after a claim doesn't produce a new object reference and
  // re-trigger this effect, which would reopen the dialog.
  // `user` is intentionally omitted from deps — including it would re-open
  // the dialog every time the auth session reference changes (e.g. after
  // useUser() re-fetches on Profile visit), even for the same reward.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
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
  }, [data?.id, isPending, load]);

  // `handleClaim` is read through a ref instead of a dependency: it's
  // re-created whenever `isClaimPending` changes, and `isClosed`/
  // `isEarnedReward` from the ad SDK stay `true` once set (they don't
  // reset on their own) — depending on `handleClaim` directly would
  // re-fire this effect on every claim-pending toggle, re-claiming in
  // an infinite loop.
  const handleClaimRef = useRef(handleClaim);
  handleClaimRef.current = handleClaim;

  useEffect(() => {
    if (isClosed && isEarnedReward) {
      setShowPrize(true);
      handleClaimRef.current();
    }
  }, [isClosed, isEarnedReward]);

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
    if (isClaimPending) {
      return;
    }
    if (isLoaded) {
      show();
    } else {
      setConnectBrandOpen(true);
    }
  };

  const handleVerifyIdentity = () => {
    handleClose();
    navigate("VerifyIdentity");
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
                isDisabled={isClaimPending}
                onPress={handleClaimReward}
              >
                <Button.Label>
                  {isClaimPending ? "Claiming Reward..." : "Claim your prize"}
                </Button.Label>
                {isClaimPending && (
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

      {/*{__DEV__ && (
        <View
          className="absolute right-2 bottom-24 gap-1 rounded-lg bg-black/80 p-2"
          pointerEvents="box-none"
        >
          {(["LOW", "HIGH", "NONE"] as const).map((tier) => (
            <Pressable
              key={tier}
              onPress={() => {
                setShowPrize(false);
                setDevClaimPending(false);
                setDevMockTier(tier);
                setDialogOpen(true);
              }}
              style={{ paddingVertical: 4, paddingHorizontal: 8 }}
            >
              <Text className="text-white text-xs">
                Mock: {tier === "NONE" ? "No prize" : `${tier} win`}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              setDialogOpen(false);
              setShowPrize(false);
              setDevMockTier(null);
              setDevClaimPending(false);
            }}
            style={{ paddingVertical: 4, paddingHorizontal: 8 }}
          >
            <Text className="text-white text-xs">Clear mock</Text>
          </Pressable>
        </View>
      )}*/}
    </>
  );
});
