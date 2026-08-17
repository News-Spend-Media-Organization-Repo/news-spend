import * as Updates from "expo-updates";
import { Dialog } from "heroui-native/dialog";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { Button } from "#/components/heroui/button";
import { Text } from "#/components/heroui/text";

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
    <Dialog isOpen={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content className="w-[90%]">
          <Dialog.Close className="absolute top-3 right-3" variant="ghost" />

          <View className="mb-4 items-center gap-3">
            <Text variant="HeadingMedium">Update Available</Text>
            <Text className="text-center text-subtle-text">
              A new version of the app is available. Restart to apply the
              update.
            </Text>
          </View>

          <Button onPress={handleUpdate}>
            <Button.Label>Restart Now</Button.Label>
          </Button>

          <Button className="mt-2" onPress={hideUpdateModal} variant="outline">
            <Button.Label>Later</Button.Label>
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );

  return { showUpdateModal, UpdateModalComponent };
};
