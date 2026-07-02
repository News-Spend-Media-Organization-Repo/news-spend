import { useMutation } from "@tanstack/react-query";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { RadioGroup } from "heroui-native/radio-group";
import { X } from "phosphor-react-native";
import React, { useId } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";

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
] as const;

function PostReportSheet(props) {
  const mutation = useMutation(orpc.postReport.create.mutationOptions());
  const [reason, setReason] = React.useState("");
  const insets = useSafeAreaInsets();
  const id = useId();

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
    <BottomSheet isOpen={props.open} onOpenChange={props.onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content style={{ paddingBottom: insets.bottom }}>
          <View className="gap-3.5 px-3 pt-3">
            <View className="flex-row justify-between">
              <View className="gap-1">
                <Text className="font-bold text-lg">Report this comment</Text>
                <Text className="text-gray-500 text-sm">
                  Why are you reporting this comment?
                </Text>
              </View>
              <Button
                className="size-8 rounded-full bg-[#d9d9d9]"
                onPress={() => props.onOpenChange(false)}
              >
                <Icon name={X} size={20} weight="regular" />
              </Button>
            </View>

            <View className="h-px bg-gray-200" />

            <RadioGroup onValueChange={setReason} value={reason}>
              <View className="gap-0">
                {reportReasons.map((r) => (
                  <RadioGroup.Item
                    className="py-2"
                    key={`${r.value}-${props.postId}-${id}`}
                    value={r.value}
                  >
                    {r.label}
                  </RadioGroup.Item>
                ))}
              </View>
            </RadioGroup>

            <Button
              className="w-full"
              disabled={mutation.isPending || !reason}
              onPress={onSubmit}
            >
              Submit
            </Button>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

export default PostReportSheet;
