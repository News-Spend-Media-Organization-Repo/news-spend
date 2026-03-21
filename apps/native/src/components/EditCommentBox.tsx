import { formatDistance } from "date-fns";
import type { RefObject } from "react";
import { useEffect, useState } from "react";
import type { TextInput } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { toast } from "sonner-native";
import {
  Avatar,
  Form,
  Paragraph,
  Separator,
  Spinner,
  Stack,
  Text,
  TextArea,
  XStack,
  YStack,
} from "tamagui";
import { useSnapshot } from "valtio";
import { subscribeKey } from "valtio/utils";

import useUpdateComment from "#/hooks/comments/useUpdateComment";
import { useGlobalBackHandler } from "#/hooks/useBackHandler";
import { authState } from "#/state/auth";
import { commentState, setEditingComment } from "#/state/commentState";

import { Button } from "./ui";

type EditCommentBoxProps = {
  newsId?: string;
  newsSlug?: string;
  /**
   * Pass the text input ref from the parent via prop `inputRef`
   * instead of using `forwardRef`, which is deprecated in this codebase.
   */
  inputRef?: RefObject<TextInput> | ((instance: TextInput | null) => void);
};

function isRefObject<T>(
  ref?: RefObject<T> | ((instance: T | null) => void)
): ref is RefObject<T> {
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
        // newsId: props.newsId,
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
      }
    );
  };

  const onCancel = () => {
    setEditingComment(undefined);
  };

  const commentUser =
    typeof editingComment?.user === "object" ? editingComment.user : null;

  return (
    <>
      {editingComment && (
        <Stack
          bottom={0}
          flex={1}
          jc="flex-end"
          left={0}
          pos="absolute"
          right={0}
          top={0}
        >
          <YStack
            animation="medium"
            bg="rgba(0,0,0,0.5)"
            bottom={0}
            enterStyle={{ y: 100 }}
            exitStyle={{ opacity: 0, y: 100 }}
            left={0}
            onPress={() => {
              if (
                inputRef &&
                typeof inputRef !== "function" &&
                "current" in inputRef &&
                (inputRef as any).current
              ) {
                (inputRef as any).current.blur();
              }
              // setEditingComment(undefined);
            }}
            position="absolute"
            right={0}
            top={0}
          />
          <KeyboardStickyView>
            <Stack bg="$background" gap="$3">
              <XStack gap="$2.5" pt="$2" px="$2.5">
                <Avatar backgroundColor="purple" circular size="$2">
                  <Text color="#fff" fos="$6">
                    {commentUser?.username
                      ?.charAt(0)
                      .toLocaleUpperCase()
                      .toUpperCase() ?? "U"}
                  </Text>
                </Avatar>
                <YStack gap="$2">
                  <XStack alignItems="center" justifyContent="space-between">
                    <XStack ai="center" gap="$2">
                      <Paragraph color="#0A0909" fontWeight="700" fos="$5">
                        {(commentUser?.username ?? "").charAt(0).toUpperCase() +
                          (commentUser?.username ?? "").slice(1)}{" "}
                        {commentUser?.userId === user?.id && "(You)"}
                      </Paragraph>
                      <Text color="#737373">
                        {formatDistance(
                          new Date(editingComment.createdAt),
                          new Date(),
                          {
                            addSuffix: true,
                          }
                        )}
                      </Text>
                    </XStack>
                  </XStack>

                  <Paragraph color="#0A0909" fos="$5">
                    {editingComment.text}
                  </Paragraph>
                </YStack>
              </XStack>
              <Separator />
              <Form gap="$2.5" onSubmit={onUpdate} pb="$2" px={10} w="100%">
                <TextArea
                  autoFocus
                  bg="$p50"
                  borderColor="transparent"
                  borderWidth={2}
                  onChangeText={(value: string) => setText(value)}
                  pt="$2.5"
                  ref={inputRef as any}
                  value={text}
                  verticalAlign="top"
                />
                <XStack gap="$2" jc="flex-end">
                  <Button onPress={onCancel} outlined>
                    <Button.Text color="black">Cancel</Button.Text>
                  </Button>
                  <Form.Trigger asChild>
                    {/* // cancel button */}
                    <Button
                      alignSelf="flex-end"
                      disabled={!text || updateCommentMutation.isPending}
                      flexDirection="column"
                    >
                      {updateCommentMutation.isPending && (
                        <Button.Icon>
                          <Spinner color="$p300" />
                        </Button.Icon>
                      )}
                      <Button.Text
                        display={
                          updateCommentMutation.isPending ? "none" : "flex"
                        }
                        fontWeight="800"
                      >
                        {updateCommentMutation.isPending ? "Saving..." : "Save"}
                      </Button.Text>
                    </Button>
                  </Form.Trigger>
                </XStack>
              </Form>
            </Stack>
          </KeyboardStickyView>
        </Stack>
      )}
    </>
  );
};
