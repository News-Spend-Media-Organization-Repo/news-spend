import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner-native";
import { AlertDialog, Button, type DialogProps, XStack, YStack } from "tamagui";

import { authClient } from "#/lib/authClient";
import { hydrateAuth } from "#/state/auth";

type Dialog = DialogProps & {
  trigger?: ReactNode;
};

export function ConfirmAsGuest({ trigger }: Dialog) {
  const anonymousSignInMutation = useMutation({
    mutationFn: async () => {
      const response = await authClient.signIn.anonymous();

      if (response.error) {
        throw new Error("Failed to sign in anonymously");
      }

      await hydrateAuth();
    },
    onSuccess: () => {
      console.log("Anonymous sign-in successful");
      toast.success("Signed in as a guest");
    },
    onError: () => {
      toast.error("Failed to sign in as a guest");
    },
  });

  const onConfirmGuest = async () => {
    await anonymousSignInMutation.mutateAsync();
  };

  return (
    <AlertDialog native>
      <AlertDialog.Trigger
        ai="center"
        asChild
        bc="transparent"
        flexDirection="row"
        jc="center"
        width="100%"
      >
        {trigger}
      </AlertDialog.Trigger>

      <AlertDialog.Portal>
        <AlertDialog.Overlay
          animation="fast"
          enterStyle={{ o: 0 }}
          exitStyle={{ o: 0 }}
          key="overlay"
          o={0.5}
        />
        <AlertDialog.Content
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
          key="content"
          opacity={1}
          scale={1}
          x={0}
          y={0}
        >
          <YStack gap="$4">
            {/* <AlertDialog.Title>Accept</AlertDialog.Title> */}
            <AlertDialog.Description>
              Are you sure you want to skip registration? You can still complete registration later,
              but you will not get the welcome points
            </AlertDialog.Description>

            <XStack gap="$3" jc="flex-end">
              <AlertDialog.Action asChild onPress={onConfirmGuest}>
                <Button>{anonymousSignInMutation.isPending ? "Loading..." : "YES, SKIP"}</Button>
              </AlertDialog.Action>
              <AlertDialog.Cancel asChild>
                <Button color="#9C9C9">CANCEL</Button>
              </AlertDialog.Cancel>
            </XStack>
          </YStack>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog>
  );
}
