import { useMutation } from "@tanstack/react-query";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { RadioGroup } from "heroui-native/radio-group";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { toast } from "#/components/heroui/toast";
import { trackDiscover } from "#/lib/discoverAnalyticsClient";
import { X } from "#/lib/icons";
import { orpc } from "#/lib/orpc";

/**
 * Reasons a game can be reported, each mapped to a reason the server already
 * understands so it reaches the same moderation queue and alerts as every
 * other report.
 */
const REASONS = [
  { label: "Inappropriate or offensive", value: "inappropriate" },
  { label: "Gambling or illegal activity", value: "illegal" },
  { label: "Spam or misleading ads", value: "spam" },
  { label: "Hate speech or harassment", value: "hate-speech" },
  { label: "Something else", value: "other" },
] as const;

type Reason = (typeof REASONS)[number]["value"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId: string;
  gameTitle?: string;
};

/** Report the game that is open (Guideline 4.7.1). */
export default function GameReportSheet({
  open,
  onOpenChange,
  gameId,
  gameTitle,
}: Props) {
  const [reason, setReason] = useState<Reason | "">("");
  const insets = useSafeAreaInsets();

  const mutation = useMutation(
    orpc.postReport.createGame.mutationOptions({
      onSuccess: () => {
        trackDiscover({ event: "game_report", itemId: gameId });
        setReason("");
        onOpenChange(false);
        toast.success("Report sent", {
          description: "Thank you. We will review this game.",
        });
      },
      onError: () => {
        toast.error("Could not send the report", {
          description: "Please try again in a moment.",
        });
      },
    })
  );

  const submit = () => {
    if (!reason) {
      return;
    }
    mutation.mutate({ gameId, reason, additionalDetails: "" });
  };

  return (
    <BottomSheet isOpen={open} onOpenChange={onOpenChange}>
      <BottomSheet.Portal disableFullWindowOverlay={__DEV__}>
        <BottomSheet.Overlay />
        <BottomSheet.Content style={{ paddingBottom: insets.bottom }}>
          <View className="gap-3.5 px-3 pt-3">
            <View className="flex-row justify-between">
              <View className="flex-1 gap-1">
                <Text className="font-bold text-lg">Report this game</Text>
                <Text className="text-gray-500 text-sm">
                  {gameTitle
                    ? `What is wrong with ${gameTitle}?`
                    : "What is wrong with this game?"}
                </Text>
              </View>
              <Button
                className="size-8 rounded-full bg-[#d9d9d9]"
                onPress={() => onOpenChange(false)}
              >
                <Icon name={X} size={20} weight="regular" />
              </Button>
            </View>

            <View className="h-px bg-gray-200" />

            <RadioGroup
              onValueChange={(value) => setReason(value as Reason)}
              value={reason}
            >
              <View className="gap-0">
                {REASONS.map((r) => (
                  <RadioGroup.Item
                    className="py-2"
                    key={r.value}
                    value={r.value}
                  >
                    {r.label}
                  </RadioGroup.Item>
                ))}
              </View>
            </RadioGroup>

            <Button
              className="w-full"
              isDisabled={mutation.isPending || !reason}
              onPress={submit}
            >
              <Button.Label>
                {mutation.isPending ? "Sending..." : "Send report"}
              </Button.Label>
            </Button>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
