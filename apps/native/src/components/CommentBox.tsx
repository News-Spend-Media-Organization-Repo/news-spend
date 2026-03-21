import { useNavigation, useRoute } from "@react-navigation/native";
import type { RefObject } from "react";
import { useEffect, useState } from "react";
import type { TextInput } from "react-native";
import { KeyboardEvents } from "react-native-keyboard-controller";
import { Form, Spinner, TextArea } from "tamagui";
import { useSnapshot } from "valtio";

import { useCreateComment } from "#/hooks/news";
import { authState } from "#/state/auth";
import { commentState, setActiveComment } from "#/state/commentState";

import { Button } from "./ui/Button";

type CommentBoxProps = {
  newsId: string;
  newsSlug?: string;
  onBlur?: () => void;
  /**
   * Pass the text input ref from the parent via prop `inputRef`
   * instead of using `forwardRef`, which is deprecated in this codebase.
   */
  inputRef?:
    | RefObject<TextInput | null>
    | ((instance: TextInput | null) => void);
};

function isRefObject<T>(
  ref?: RefObject<T> | ((instance: T | null) => void)
): ref is RefObject<T> {
  return !!ref && typeof ref !== "function" && "current" in ref;
}

export const CommentBox = (props: CommentBoxProps) => {
  const { inputRef } = props;
  const [text, setText] = useState("");
  const { user } = authState;
  const { replyingToComment, parentComment } = useSnapshot(commentState);
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params as { commentId?: string } | undefined;

  useEffect(() => {
    const hideSubscription = KeyboardEvents.addListener(
      "keyboardDidHide",
      () => {
        if (isRefObject(inputRef) && inputRef.current) {
          inputRef.current.blur();
        }
        setActiveComment(undefined, undefined);
        setText("");
      }
    );

    return () => {
      hideSubscription.remove();
    };
  }, [inputRef]);

  const createCommentMutation = useCreateComment(props.newsSlug as string);

  const onSubmit = () => {
    if (!user || user.isAnonymous) {
      // Navigation types may not include SignIn params; coerce here to pass a redirect.
      navigation.navigate("SignIn" as any, { redirect: route.name } as any);
      return;
    }

    createCommentMutation.mutate(
      {
        newsId: props.newsId,
        text,
        replyingTo: commentState.replyingToComment?.id,
        // if on reply screen, commentId is the parent comment id
        parentId: params?.commentId ?? commentState.parentComment?.id,
      },
      {
        onSuccess: () => {
          if (isRefObject(inputRef) && inputRef.current) {
            inputRef.current.blur();
          }
        },
      }
    );
  };

  const getUsername = (u: unknown): string | undefined => {
    if (!u) return;
    if (typeof u === "string") return u;
    return (u as { username?: string }).username;
  };
  const username =
    getUsername(replyingToComment?.user) ?? getUsername(parentComment?.user);

  return (
    // <KeyboardAvoidingView behavior="padding">
    <Form
      bc="$background"
      gap="$2.5"
      onSubmit={() => onSubmit()}
      pb="$2"
      px={10}
      w="100%"
    >
      <TextArea
        bg="$p50"
        borderColor="transparent"
        borderWidth={2}
        onChangeText={(value) => setText(String(value))}
        placeholder={
          username ? `Replying to ${username}` : "Write a comment..."
        }
        pt="$2.5"
        ref={inputRef as any}
        value={text}
      />
      <Form.Trigger asChild>
        <Button
          alignSelf="flex-end"
          disabled={!text || createCommentMutation.isPending}
          flexDirection="column"
          // color={text ? "$p300" : "gray"}
        >
          {createCommentMutation.isPending ? (
            <Button.Icon>
              <Spinner color="$p300" />
            </Button.Icon>
          ) : null}
          <Button.Text
            display={createCommentMutation.isPending ? "none" : "flex"}
            fontWeight="800"
          >
            {createCommentMutation.isPending ? "Posting..." : "Post"}
          </Button.Text>
        </Button>
      </Form.Trigger>
    </Form>
    // </KeyboardAvoidingView>
  );
};
