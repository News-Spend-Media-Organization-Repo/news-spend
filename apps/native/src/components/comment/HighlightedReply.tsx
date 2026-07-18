import { useQuery } from "@tanstack/react-query";
import { BellIcon } from "phosphor-react-native";
import type { RefObject } from "react";
import { type TextInput, View } from "react-native";

import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";
import Reply from "./Reply";

type HighlightedReplyProps = {
  commentId: string;
  inputRef?: RefObject<TextInput | null>;
};

/**
 * The comment a push notification pointed at (a new reply, or the liked
 * comment), pinned directly under the thread root so it's immediately
 * visible without scrolling. The regular reply list continues below and
 * filters this comment out to avoid showing it twice.
 */
export function HighlightedReply({
  commentId,
  inputRef,
}: HighlightedReplyProps) {
  const { data } = useQuery(
    orpc.comments.one.queryOptions({ input: commentId })
  );

  if (!data?.id) {
    return null;
  }

  return (
    <View className="mx-2.5 mt-2 rounded-xl border border-p-500/15 bg-p-500/5 pt-2">
      <View className="mb-1 flex-row items-center gap-1 px-2.5">
        <Icon className="text-p-400" name={BellIcon} size={14} />
        <Text className="text-p-400 text-xs">From your notification</Text>
      </View>
      <Reply comment={data} inputRef={inputRef} />
    </View>
  );
}
