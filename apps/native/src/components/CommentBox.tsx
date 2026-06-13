import { useNavigation, useRoute } from "@react-navigation/native";
import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { KeyboardEvents } from "react-native-keyboard-controller";
import { useSnapshot } from "valtio";

import { Button } from "#/components/heroui/button";
import { useCreateComment } from "#/hooks/news";
import { authState } from "#/state/auth";
import { commentState, setActiveComment } from "#/state/commentState";

type CommentBoxProps = {
  newsId: string;
  newsSlug?: string;
  onBlur?: () => void;
  /**
   * Pass the text input ref from the parent via prop `inputRef`
   * instead of using `forwardRef`, which is deprecated in this codebase.
   */
  inputRef?: RefObject<TextInput | null> | ((instance: TextInput | null) => void);
};

function isRefObject<T>(ref?: RefObject<T> | ((instance: T | null) => void)): ref is RefObject<T> {
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
    const hideSubscription = KeyboardEvents.addListener("keyboardDidHide", () => {
      if (isRefObject(inputRef) && inputRef.current) {
        inputRef.current.blur();
      }
      setActiveComment(undefined, undefined);
      setText("");
    });

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
        parentId: params?.commentId ?? commentState.parentComment?.id,
      },
      {
        onSuccess: () => {
          if (isRefObject(inputRef) && inputRef.current) {
            inputRef.current.blur();
          }
        },
      },
    );
  };

  const getUsername = (u: unknown): string | undefined => {
    if (!u) return;
    if (typeof u === "string") return u;
    return (u as { username?: string }).username;
  };
  const username = getUsername(replyingToComment?.user) ?? getUsername(parentComment?.user);

  return (
    <View className="w-full bg-background gap-2.5 pb-2 px-2.5">
      <TextInput
        className="bg-p-50 border-2 border-transparent rounded-lg pt-2.5 px-4 text-base"
        onChangeText={(value) => setText(String(value))}
        placeholder={username ? `Replying to ${username}` : "Write a comment..."}
        placeholderTextColorClassName="accent-gray-400"
        ref={inputRef as any}
        value={text}
        multiline
      />
      <Button
        className="self-end flex-col"
        disabled={!text || createCommentMutation.isPending}
        onPress={onSubmit}
      >
        {createCommentMutation.isPending ? <ActivityIndicator className="text-p-300" /> : null}
        <Button.Label className={createCommentMutation.isPending ? "hidden" : "font-extrabold"}>
          {createCommentMutation.isPending ? "Posting..." : "Post"}
        </Button.Label>
      </Button>
    </View>
  );
};
