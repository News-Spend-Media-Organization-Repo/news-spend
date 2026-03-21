import type { Comment } from "@news-spend-media/payload/types";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Reply } from "@tamagui/lucide-icons";
import { formatDistance } from "date-fns";
import { ChatIcon, Clock, HeartStraightIcon } from "phosphor-react-native";
import { forwardRef, useMemo } from "react";
import {
  Avatar,
  Paragraph,
  Separator,
  type TamaguiElement,
  Text,
  XStack,
  YStack,
} from "tamagui";
import { useSnapshot } from "valtio";

import { Button } from "#/components/ui/Button";
import useLikeComment from "#/hooks/comments/useLikeComment";
import { authState } from "#/state/auth";
import { randomColor } from "#/utils/index";

import CommentOptionPopover from "./CommentOptionPopover";

type CommentCardProps = {
  comment: Comment;
  isLast?: boolean;
  parentId?: string;
  replyingTo?: string;
  setReplyingTo?: (id: string) => void;
  setParentId?: (id: string) => void;
};

const CommentCard = forwardRef<TamaguiElement, CommentCardProps>(
  ({ comment, isLast, parentId, replyingTo }, ref) => {
    const newsId =
      typeof comment?.news === "string" ? comment?.news : comment?.news?.id;
    const { mutate } = useLikeComment(newsId, parentId);
    const auth = useSnapshot(authState);
    const route = useRoute();

    const avatarBg = useMemo(() => randomColor(), []);

    const navigation = useNavigation();

    if (!comment) return null;

    const navigateToReplies = () => {
      if (route.name === "Comment") {
        navigation.navigate("CommentReply", {
          commentId: comment.id,
          newsId,
          newsSlug: route.params?.newsSlug as string,
        });
      } else {
        navigation.navigate("LiveCommentReply", {
          commentId: comment.id,
          newsId,
          newsSlug: route.params?.newsSlug as string,
        });
      }
    };

    const isRepliesScreen = route.name.toString() === "CommentReply";

    const isLiked = comment.likes?.find((user) =>
      typeof user === "string"
        ? user === authState.user?.id
        : user?.id === authState.user?.id
    );
    const isDisliked = comment.dislikes?.find((user) =>
      typeof user === "string"
        ? user === authState.user?.id
        : user?.id === authState.user?.id
    );

    const onLike = () => {
      if (!authState.user || authState.user.isAnonymous) {
        return navigation.navigate("SignIn", {
          redirect: route.name,
        });
      }
      mutate(comment.id);
    };

    const onReply = () => {
      if (route.name === "SingleLive") {
        return navigation.navigate("LiveCommentReply", {
          commentId: comment.id,
          newsId,
          newsSlug: route.params?.newsSlug as string,
          focus: true,
        });
      }
      return navigation.navigate("CommentReply", {
        commentId: comment.id,
        newsId,
        newsSlug: route.params?.newsSlug as string,
        focus: true,
      });
      // setActiveComment(comment, undefined);
      // console.log(commentState);

      // ref?.current?.focus();
    };

    const commentUser = typeof comment.user === "object" ? comment.user : null;

    return (
      <YStack position="relative">
        <XStack gap="$2.5" px="$2.5">
          <Avatar backgroundColor={avatarBg} circular size="$2">
            <Text color="#fff" fos="$6">
              {(typeof comment.user === "object" &&
                comment.user.username?.[0].toUpperCase()) ??
                "U"}
            </Text>
          </Avatar>
          <YStack flex={1} gap="$2">
            <XStack alignItems="center" justifyContent="space-between">
              <YStack gap="$0">
                <Paragraph color="#0A0909" fontWeight="700" fos="$4">
                  {commentUser?.username
                    ? commentUser.username.charAt(0).toUpperCase() +
                      commentUser.username.slice(1)
                    : "U"}{" "}
                  {commentUser?.id === auth.session?.user?.id && "(You)"}
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
                  <HeartStraightIcon
                    size={16}
                    weight={isLiked ? "bold" : "regular"}
                  />
                </Button.Icon>
                <Button.Text color="#737373" fos={16}>
                  {isLiked ? "Liked" : "Like"}
                </Button.Text>
              </Button>

              <Button ghost onPress={onReply} p="$0">
                <Button.Icon color="#737373">
                  <Reply size={16} />
                </Button.Icon>
                <Button.Text color="#737373" fos={15}>
                  Reply
                </Button.Text>
              </Button>

              <Button
                ai="center"
                disabled={isRepliesScreen}
                flexDirection="row"
                gap="$1.5"
                ghost
                onPress={navigateToReplies}
                p="$0"
              >
                <Button.Icon color="#737373">
                  <ChatIcon size={18} />
                </Button.Icon>
                <Button.Text color="#737373" fos={15}>
                  {comment.totalReplies} Comment
                  {(comment?.totalReplies ?? 0) > 1 ? "s" : ""}
                </Button.Text>
              </Button>
              {/* </Link> */}
            </XStack>
          </YStack>
          <CommentOptionPopover comment={comment} />
        </XStack>
        <Separator bg="$p200" my="$3.5" />
      </YStack>
    );
  }
);

export default CommentCard;
