import type { Comment } from "@news-spend-media/payload/types";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Reply as ReplyIcon } from "@tamagui/lucide-icons";
import { formatDistance } from "date-fns";
import { forwardRef, useMemo } from "react";
import {
  Avatar,
  Paragraph,
  Separator,
  Stack,
  type TamaguiElement,
  Text,
  XStack,
  YStack,
} from "tamagui";
import { Clock, HeartStraightBold, HeartStraightFill } from "tamagui-phosphor";
import { useSnapshot } from "valtio";

import { Button } from "#/components/ui";
import useLikeComment from "#/hooks/comments/useLikeComment";
import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { authState } from "#/state/auth";
import { setActiveComment } from "#/state/commentState";
import { randomColor } from "#/utils/index";

import CommentOptionPopover from "./CommentOptionPopover";

type CommentReplyProps = {
  comment: Comment;
  parentId?: string;
  replyingTo?: string;
  setReplyingTo?: (id: string) => void;
  setParentId?: (id: string) => void;
};

const Reply = forwardRef<TamaguiElement, CommentReplyProps>(
  ({ comment }, ref) => {
    const route = useRoute();
    const { commentId: parentCommentId, newsId } = route.params;
    const { mutate } = useLikeComment(newsId);
    const auth = useSnapshot(authState);
    const navigation = useNavigation();

    const avatarBg = useMemo(() => randomColor(), []);

    const isLiked = comment.likes?.find((user) =>
      typeof user === "string"
        ? user === auth.user?.id
        : user?.id === auth.user?.id
    );
    const isDisliked = comment.dislikes?.find((user) =>
      typeof user === "string"
        ? user === auth.user?.id
        : user?.id === auth.user?.id
    );

    const parentComment = queryClient.getQueryData([
      orpc.comments.getComment.queryOptions({
        input: parentCommentId,
      }).queryKey,
    ]);

    const onReply = () => {
      setActiveComment(parentComment, comment);
      ref?.current?.focus();
    };

    const onLike = () => {
      if (!authState.user || authState.user.isAnonymous) {
        return navigation.navigate("SignIn", {
          redirect: "CommentReply",
        });
      }

      mutate({
        commentId: comment.id,
      });
    };

    return (
      <Stack ml="$10" px="$2.5">
        <XStack>
          <XStack flex={1} gap="$2.5">
            <Avatar backgroundColor={avatarBg} circular size="$2">
              <Text color="#fff" fos="$6">
                {(typeof comment.user === "object" &&
                  comment.user.username.charAt(0).toUpperCase()) ||
                  "U"}
              </Text>
            </Avatar>
            <YStack flex={1} gap="$2">
              <XStack alignItems="center" justifyContent="space-between">
                <YStack gap="$0">
                  <Paragraph color="#0A0909" fontWeight="700" fos="$5">
                    {((typeof comment.user === "object" &&
                      comment.user.username.charAt(0).toUpperCase()) ||
                      "U") +
                      ((typeof comment.user === "object" &&
                        comment.user.username.slice(1)) ||
                        "Unknown")}{" "}
                    {(typeof comment.user !== "string" && comment.user?.id) ===
                      auth.user?.id && "(You)"}
                  </Paragraph>
                  <XStack ai="center" gap="$1">
                    <Clock color="#737373" size={16} strokeWidth={5} />
                    <Text color="#737373">
                      {formatDistance(new Date(comment.createdAt), new Date(), {
                        addSuffix: true,
                      })}
                    </Text>
                  </XStack>
                </YStack>
              </XStack>

              <Paragraph color="#0A0909" fos={15} lh="$1">
                {comment.text}
              </Paragraph>
              <XStack ai="center" gap="$5">
                <Button
                  ai="center"
                  flexDirection="row"
                  gap="$1"
                  ghost
                  onPress={onLike}
                  p="$0"
                >
                  <Button.Icon color={isLiked ? "#fb2d2d" : "#737373"}>
                    {isLiked ? (
                      <HeartStraightFill size={16} />
                    ) : (
                      <HeartStraightBold size={16} />
                    )}
                  </Button.Icon>
                  <Button.Text color="#737373" fos={16}>
                    {isLiked ? "Liked" : "Like"}
                  </Button.Text>
                </Button>

                <Button ghost onPress={onReply} p="$0">
                  <Button.Icon color="#737373">
                    <ReplyIcon size={16} />
                  </Button.Icon>
                  <Button.Text color="#737373" fos={15}>
                    Reply
                  </Button.Text>
                </Button>
              </XStack>
            </YStack>
          </XStack>
          <Stack ai="center" jc="space-between">
            <CommentOptionPopover comment={comment} />
          </Stack>
        </XStack>

        <Separator bg="$p200" my="$3.5" />
      </Stack>
    );
  }
);

export default Reply;
