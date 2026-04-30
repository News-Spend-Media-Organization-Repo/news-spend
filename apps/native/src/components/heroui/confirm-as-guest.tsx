import { useMutation } from "@tanstack/react-query";
import { Dialog } from "heroui-native";
import type { ReactNode } from "react";
import { useState } from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import { authClient } from "#/lib/authClient";
import { hydrateAuth } from "#/state/auth";
import { Button } from "./button";

type ConfirmAsGuestProps = {
  trigger: ReactNode;
};

export function ConfirmAsGuest({ trigger }: ConfirmAsGuestProps) {
  const [isOpen, setIsOpen] = useState(false);

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
      setIsOpen(false);
    },
    onError: () => {
      toast.error("Failed to sign in as a guest");
    },
  });

  const onConfirmGuest = async () => {
    await anonymousSignInMutation.mutateAsync();
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Close variant="ghost" />
          <Dialog.Description className="mb-6 leading-relaxed">
            Are you sure you want to skip registration? You can still complete registration later,
            but you will not get the welcome points
          </Dialog.Description>
          <View className="flex-row justify-end gap-3">
            <Button
              isDisabled={anonymousSignInMutation.isPending}
              onPress={onConfirmGuest}
              size="sm"
              variant="primary"
            >
              {anonymousSignInMutation.isPending ? "Loading..." : "YES, SKIP"}
            </Button>
            <Button onPress={() => setIsOpen(false)} size="sm" variant="ghost">
              Cancel
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

export default ConfirmAsGuest;
