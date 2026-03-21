import { X } from "@tamagui/lucide-icons";
import * as Updates from "expo-updates";
import { useCallback, useState } from "react";
import { Dialog, H4, Paragraph, Unspaced, YStack } from "tamagui";

import { Button } from "#/components/ui";

export const useUpdateModal = () => {
  const [isOpen, setIsOpen] = useState(false);

  const showUpdateModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const hideUpdateModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleUpdate = async () => {
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (error) {
      console.error("Error updating:", error);
      setIsOpen(false);
    }
  };

  const UpdateModalComponent = () => (
    <Dialog modal onOpenChange={setIsOpen} open={isOpen}>
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
          w="90%"
        >
          <YStack alignItems="center" gap="$3">
            <H4 textAlign="center">Update Available</H4>
            <Paragraph color="$gray.50" fos="$4" ta="center">
              A new version of the app is available. Restart to apply the
              update.
            </Paragraph>
          </YStack>

          <Button onPress={handleUpdate}>
            <Button.Text>Restart Now</Button.Text>
          </Button>

          <Button onPress={hideUpdateModal} outlined>
            <Button.Text>Later</Button.Text>
          </Button>

          <Unspaced>
            <Dialog.Close asChild>
              <Button
                br="$9"
                h="auto"
                outlined
                p="$1"
                position="absolute"
                right="$3"
                top="$3"
              >
                <Button.Icon color="$p500">
                  <X size={16} />
                </Button.Icon>
              </Button>
            </Dialog.Close>
          </Unspaced>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );

  return { showUpdateModal, UpdateModalComponent };
};
