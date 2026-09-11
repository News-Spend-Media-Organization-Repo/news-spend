import { BottomSheet } from "heroui-native/bottom-sheet";
import { View } from "react-native";

import { Button } from "#/components/heroui/button";
import { Text } from "#/components/heroui/text";

type UpdateSheetProps = {
  isOpen: boolean;
  onOpenChange: (value: boolean) => void;
  /** A mandatory update cannot be dismissed by any route. */
  isMandatory: boolean;
  onRestart: () => void;
};

// The sheet only ever opens once the update has finished downloading
// (see useUpdates in UpdatesProvider), so a restart here is always instant.
export function UpdateSheet({
  isOpen,
  onOpenChange,
  isMandatory,
  onRestart,
}: UpdateSheetProps) {
  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        {/*
          A mandatory update is the one case where dismissal is refused by every
          route (handle and backdrop both). Optional updates stay dismissible:
          the check re-runs on the next foreground, so losing the sheet costs
          the user nothing.
        */}
        <BottomSheet.Overlay isCloseOnPress={!isMandatory} />
        <BottomSheet.Content
          enableDynamicSizing
          enablePanDownToClose={!isMandatory}
        >
          <View className="gap-4 px-5 pt-2 pb-8">
            <View className="items-center gap-2">
              <Text className="text-center font-semibold text-lg">
                {isMandatory ? "Update Required" : "Update Available"}
              </Text>
              <Text className="text-center text-subtle-text">
                {isMandatory
                  ? "This version is no longer supported. Restart to continue using the app."
                  : "A new version of the app is available. Restart to apply the update."}
              </Text>
            </View>

            <Button onPress={onRestart}>
              <Button.Label>Restart Now</Button.Label>
            </Button>

            {isMandatory ? null : (
              <Button onPress={() => onOpenChange(false)} variant="outline">
                <Button.Label>Later</Button.Label>
              </Button>
            )}
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
