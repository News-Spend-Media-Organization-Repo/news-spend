import { formatDistance } from "date-fns";
import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { toast } from "sonner-native";
import { useSnapshot } from "valtio";
import { subscribeKey } from "valtio/utils";

import { Button } from "#/components/heroui/button";
import { Text } from "#/components/heroui/text";
import useUpdateComment from "#/hooks/comments/useUpdateComment";
import { useGlobalBackHandler } from "#/hooks/useBackHandler";
import { authState } from "#/state/auth";
import { commentState, setEditingComment } from "#/state/commentState";

type EditCommentBoxProps = {
  newsId?: string;
  newsSlug?: string;
  /**
   * Pass the text input ref from the parent via prop `inputRef`
   * instead of using `forwardRef`, which is deprecated in this codebase.
   */
  inputRef?: RefObject<TextInput> | ((instance: TextInput | null) => void);
};

function isRefObject<T>(ref?: RefObject<T> | ((instance: T | null) => void)): ref is RefObject<T> {
  return !!ref && typeof ref !== "function" && "current" in ref;
}

export const EditCommentBox = (props: EditCommentBoxProps) => {
  const { inputRef } = props;
  const { user } = authState;
  const { editingComment } = useSnapshot(commentState);
  const [text, setText] = useState(editingComment?.text ?? "");

  const updateCommentMutation = useUpdateComment(props.newsSlug as string);

  useEffect(() => {
    const unsubscribe = subscribeKey(commentState, "editingComment", (v) => {
      setText(v?.text ?? "");
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useGlobalBackHandler(() => {
    if (commentState.editingComment) {
      setEditingComment(undefined);
      return true;
    }
    return false;
  });

  const onUpdate = () => {
    const editingCommentId = commentState.editingComment?.id;
    if (!editingCommentId) {
      toast.error("No comment selected to update");
      return;
    }
    toast.loading("Updating comment", { description: "Please wait..." });
    updateCommentMutation.mutate(
      {
        text,
        commentId: editingCommentId,
      },
      {
        onSuccess: () => {
          setEditingComment(undefined);
          toast.dismiss();
          toast.success("Comment updated", {
            description: "Comment updated successfully",
          });
        },
        onError: (err) => {
          toast.dismiss();
          console.log(err);
          toast.error("Something went wrong", {
            description: "Comment could not be updated",
          });
        },
      },
    );
  };

  const onCancel = () => {
    setEditingComment(undefined);
  };

  const commentUser = typeof editingComment?.user === "object" ? editingComment.user : null;

  return (
    <>
      {editingComment && (
        <View className="absolute inset-0 flex-1 justify-end">
          {/* Overlay backdrop */}
          <Pressable
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            onPress={() => {
              if (
                inputRef &&
                typeof inputRef !== "function" &&
                "current" in inputRef &&
                (inputRef as unknown as { current: TextInput | null }).current
              ) {
                (inputRef as unknown as { current: TextInput | null }).current?.blur();
              }
            }}
          />
          <KeyboardStickyView>
            <View className="bg-background gap-3">
              {/* Comment info header */}
              <View className="flex-row gap-2.5 pt-2 px-2.5">
                <View className="h-8 w-8 items-center justify-center rounded-full bg-purple-600">
                  <Text className="text-[#fff] text-base">
                    {commentUser?.username?.charAt(0).toLocaleUpperCase().toUpperCase() ?? "U"}
                  </Text>
                </View>
                <View className="flex-1 gap-2">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Text className="font-bold text-[#0A0909]" variant="subtitle">
                        {(commentUser?.username ?? "").charAt(0).toUpperCase() +
                          (commentUser?.username ?? "").slice(1)}{" "}
                        {commentUser?.userId === user?.id && "(You)"}
                      </Text>
                      <Text className="text-[#737373] text-sm">
                        {formatDistance(new Date(editingComment.createdAt), new Date(), {
                          addSuffix: true,
                        })}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-[#0A0909] text-[15px]">{editingComment.text}</Text>
                </View>
              </View>

              <View className="h-px bg-separator" />

              {/* Edit form */}
              <View className="w-full gap-2.5 pb-2 px-2.5">
                <TextInput
                  autoFocus
                  className="bg-p-50 border-2 border-transparent rounded-lg pt-2.5 px-4 text-base align-top"
                  onChangeText={(value: string) => setText(value)}
                  ref={inputRef as any}
                  value={text}
                  multiline
                  placeholderTextColorClassName="accent-gray-400"
                />
                <View className="flex-row gap-2 justify-end">
                  <Button variant="ghost" onPress={onCancel} className="border border-p-300">
                    <Button.Label className="text-black">Cancel</Button.Label>
                  </Button>
                  <Button
                    className="self-end flex-col"
                    disabled={!text || updateCommentMutation.isPending}
                    onPress={onUpdate}
                  >
                    {updateCommentMutation.isPending && (
                      <ActivityIndicator className="text-p-300" />
                    )}
                    <Button.Label
                      className={updateCommentMutation.isPending ? "hidden" : "font-extrabold"}
                    >
                      {updateCommentMutation.isPending ? "Saving..." : "Save"}
                    </Button.Label>
                  </Button>
                </View>
              </View>
            </View>
          </KeyboardStickyView>
        </View>
      )}
    </>
  );
};
