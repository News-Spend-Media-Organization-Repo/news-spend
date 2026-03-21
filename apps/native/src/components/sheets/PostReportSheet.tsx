import { X } from "@tamagui/lucide-icons";
import { useMutation } from "@tanstack/react-query";
import React, { useId } from "react";
import { toast } from "sonner-native";
import {
  H4,
  Label,
  Paragraph,
  RadioGroup,
  Separator,
  Sheet,
  Spinner,
  Stack,
  XStack,
  YStack,
} from "tamagui";

import { Button } from "#/components/ui";
import { useGlobalBackHandler } from "#/hooks/useBackHandler";
import { orpc } from "#/lib/orpc";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

const reportReasons = [
  { label: "Spam or Advertising", value: "spam" },
  { label: "Harassment or Bullying", value: "harassment" },
  { label: "Hate Speech or Discrimination", value: "hate-speech" },
  { label: "Misinformation", value: "misinformation" },
  { label: "Personal Information", value: "personal-info" },
  { label: "Explicit or Inappropriate Content", value: "inappropriate" },
  { label: "Off-Topic", value: "off-topic" },
  { label: "Trolling or Deliberate Provocation", value: "trolling" },
  { label: "Illegal Activity", value: "illegal" },
  // { label: "Other", value: "other" },
] as const;

function PostReportSheet(props) {
  const mutation = useMutation(orpc.postReport.create.mutationOptions());
  const [reason, setReason] = React.useState("");
  const insets = useSafeAreaInsetsStyle(["bottom"]);
  const id = useId();

  useGlobalBackHandler(() => {
    if (props.open) {
      props.onOpenChange(false);
      return true;
    }

    return false;
  });

  const onSubmit = () => {
    mutation.mutate(
      {
        reason,
        reportedItem: props.postId,
        reportType: props.reportType,
        additionalDetails: props.additionalDetails ?? "",
      },
      {
        onSuccess: () => {
          props.onOpenChange(false);
          toast.success("Report submitted!", {
            description: "Thank you for your feedback!",
          });
        },
        onError: (err) => {
          console.log(err);
          toast.error("Error submitting report", {
            description: "Something went wrong",
          });
        },
      }
    );
  };

  return (
    <Sheet
      animation="easeOut"
      dismissOnSnapToBottom
      forceRemoveScrollEnabled={props.open}
      // snapPoints={["fit", "50%"]}
      modal
      native
      onOpenChange={props.onOpenChange}
      open={props.open}
      snapPointsMode="fit"
    >
      <Sheet.Overlay animation="easeOut" bg="rgba(0, 0, 0, 0.5)" />

      <Sheet.Frame flex={1} gap="$3.5" pt="$3" px="$3">
        <Sheet.ScrollView
          contentContainerStyle={{
            gap: "$2.5",
            paddingBottom: insets.paddingBottom,
          }}
        >
          <XStack jc="space-between">
            <Stack>
              <H4>Report this comment</H4>
              <Paragraph fos="$4">
                Why are you reporting this comment?
              </Paragraph>
            </Stack>
            <Button
              bg="#d9d9d9"
              borderRadius="$12"
              h="$2"
              onPress={() => props.onOpenChange(false)}
              unstyled
              w="$2"
            >
              <Button.Icon>
                <X size={20} />
              </Button.Icon>
            </Button>
          </XStack>

          <Separator />
          <RadioGroup
            aria-labelledby="Select one item"
            name="form"
            onValueChange={setReason}
            value={reason}
          >
            <YStack gap="$0">
              {reportReasons.map((reason, index) => (
                <XStack
                  ai="center"
                  gap="$3"
                  key={`${reason.value}-${props.postId}-${id}`}
                >
                  <RadioGroup.Item
                    id={`radiogroup-${reason.value}-${props.postId}-${id}`}
                    value={reason.value}
                  >
                    <RadioGroup.Indicator />
                  </RadioGroup.Item>

                  <Label
                    flex={1}
                    htmlFor={`radiogroup-${reason.value}-${props.postId}-${id}`}
                    lh="$7"
                  >
                    {reason.label}
                  </Label>
                </XStack>
              ))}
            </YStack>
          </RadioGroup>

          <Stack>
            <Button disabled={mutation.isPending || !reason} onPress={onSubmit}>
              <Button.Text>Submit</Button.Text>
              {mutation.isPending && (
                <Button.Icon>
                  <Spinner color="white" />
                </Button.Icon>
              )}
            </Button>
          </Stack>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  );
}

export default PostReportSheet;
