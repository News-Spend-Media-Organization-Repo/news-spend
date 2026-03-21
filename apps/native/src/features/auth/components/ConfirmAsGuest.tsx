import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { AlertDialog, Button, type DialogProps, XStack, YStack } from "tamagui";

type Dialog = DialogProps & {
  trigger?: ReactNode;
};

export function ConfirmAsGuest({ trigger }: Dialog) {
  const navigation = useNavigation();

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
              Are you sure you want to skip registration? You can still complete
              registration later, but you will not get the welcome points
            </AlertDialog.Description>

            <XStack gap="$3" jc="flex-end">
              <AlertDialog.Action
                asChild
                onPress={() =>
                  navigation.navigate("TOS", {
                    goto: "Root",
                  })
                }
              >
                <Button>YES, SKIP</Button>
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
