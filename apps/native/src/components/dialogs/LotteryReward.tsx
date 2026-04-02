import { X } from "@tamagui/lucide-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { XIcon } from "phosphor-react-native";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { TestIds, useRewardedAd } from "react-native-google-mobile-ads";
import { toast } from "sonner-native";
import { Dialog, H4, Paragraph, Spinner, Square, Unspaced } from "tamagui";
import { Star } from "tamagui-phosphor";
import { useSnapshot } from "valtio";

import { PartnerAdDialog } from "#/components/discover/PartnerAdDialog";
import { Button } from "#/components/ui";
import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { navigate } from "#/navigation/navigationUtils";
import { authState } from "#/state/auth";

export default memo(function LotteryReward() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showPrize, setShowPrize] = useState(false);
  const [connectBrandOpen, setConnectBrandOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { session } = useSnapshot(authState);
  const user = session?.user;

  // Fetch reward data when a user is authenticated.
  const { data, isPending } = useQuery(
    orpc.lottery.getReward.queryOptions({
      staleTime: Number.POSITIVE_INFINITY,
      enabled: Boolean(user),
    })
  );
  // console.log(data);

  const { isLoaded, isClosed, load, show, isEarnedReward } = useRewardedAd(
    TestIds.REWARDED
  );

  const claimRewardMutation = useMutation(
    orpc.lottery.claimReward.mutationOptions({
      onSuccess: () => {
        if (!data?.prize) return;

        if (data.prizeTier === "LOW") {
          toast.success("Reward claimed!", {
            description: `${data.prize} points added!`,
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
      },
    })
  );

  // Effect: when data, user, and not pending, schedule the dialog to open and preload the ad.
  useEffect(() => {
    if (data && !isPending && user) {
      timeoutRef.current = setTimeout(() => {
        setDialogOpen(true);
      }, 5000);
      load();

      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }
  }, [data, isPending, user, load]);

  // Effect: When the ad is closed and the user earned the reward,
  // show the prize content and claim the reward.
  useEffect(() => {
    if (isClosed && isEarnedReward) {
      setShowPrize(true);
      handleClaim();
      // load(); // preload next ad if needed
    }
  }, [isClosed, isEarnedReward, load]);

  // Helper: Claim the reward via mutation
  const handleClaim = useCallback(() => {
    if (!data || claimRewardMutation.isPending) return;
    claimRewardMutation.mutate({ winnerId: data.id });
  }, [data, claimRewardMutation]);

  // When closing the dialog, perform cleanup and, if no prize exists, try to claim.
  const handleClose = () => {
    setDialogOpen(false);
    if (data?.prize) {
      queryClient.invalidateQueries(orpc.lottery.getReward.queryOptions());
    } else {
      handleClaim();
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  // Function called when the user taps the “Claim your prize” button.
  // For a LOW prize, claim directly; for others, either show the ad or launch the brand connection dialog.
  const handleClaimReward = () => {
    if (claimRewardMutation.isPending) return;
    if (isLoaded) {
      show();
    } else {
      setConnectBrandOpen(true);
    }
  };

  // Navigate to the identity verification screen.
  const handleVerifyIdentity = () => {
    setDialogOpen(false);
    // navigate("Tab", {
    //   screen: "Settings",
    //   params: {
    //     screen: "VerifyIdentity",
    //     initial: true,
    //   },
    // });
    handleClose();
  };

  // Do not render until we have a reward data object.
  // if (!data) return null;

  return (
    <>
      <Dialog
        modal
        onOpenChange={(openVal) => {
          setDialogOpen(openVal);
          if (!openVal) {
            handleClose();
          }
        }}
        open={dialogOpen}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            animation="slow"
            bg="black"
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
            key="overlay"
            opacity={0.5}
          />
          <Dialog.Content
            animateOnly={["transform", "opacity"]}
            animation={[
              "fast",
              {
                opacity: {
                  overshootClamping: true,
                },
              },
            ]}
            bordered
            elevate
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            gap="$4"
            key="content"
            w="95%"
          >
            {data?.prize ? (
              showPrize ? (
                <Square>
                  <Star color="$p500" size={48} />
                  <Paragraph
                    bg="$s75"
                    br="$12"
                    color="$s400"
                    fow="800"
                    mt="$2"
                    px="$2.5"
                    textAlign="center"
                  >
                    {`${data.prize} ${data.prizeTier === "LOW" ? "points" : ""}`}
                  </Paragraph>
                  <H4 textAlign="center">Congratulations!</H4>
                  <Paragraph color="$gray.50" fos="$4" ta="center">
                    You won {data.prize}{" "}
                    {data.prizeTier === "LOW" ? "points" : ""} in the Lottery.
                  </Paragraph>
                </Square>
              ) : (
                <Square>
                  <H4 textAlign="center">Congratulations!</H4>
                  <Paragraph color="$gray.50" fos="$4" ta="center">
                    You have won a prize from the Lottery.
                  </Paragraph>
                </Square>
              )
            ) : (
              <Square>
                <H4 textAlign="center">Better luck next time!</H4>
                <Paragraph color="$gray.50" fos="$4" ta="center">
                  Unfortunately, you didn't win any prizes this time. Keep
                  participating for more chances to win!
                </Paragraph>
              </Square>
            )}

            {data?.prize && !showPrize && (
              <Button
                disabled={claimRewardMutation.isPending}
                onPress={handleClaimReward}
              >
                <Button.Text>
                  {claimRewardMutation.isPending
                    ? "Claiming Reward..."
                    : "Claim your prize"}
                </Button.Text>
                {claimRewardMutation.isPending && (
                  <Button.Icon>
                    <Spinner />
                  </Button.Icon>
                )}
              </Button>
            )}

            {data?.prize && showPrize && data.prizeTier !== "LOW" && (
              <Button onPress={handleVerifyIdentity}>
                <Button.Text>Verify your Identity</Button.Text>
              </Button>
            )}

            <Unspaced>
              <Dialog.Close asChild>
                <Button ghost p="$1" position="absolute" right="$2" top="$1">
                  <Button.Icon color="$p500">
                    <XIcon size={16} />
                  </Button.Icon>
                </Button>
              </Dialog.Close>
            </Unspaced>
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
