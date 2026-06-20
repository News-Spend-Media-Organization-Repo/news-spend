import type { Comment } from "@news-spend-media/payload/types";
import { useNavigation, useRoute } from "@react-navigation/native";
import { formatDistance } from "date-fns";
import { Separator } from "heroui-native";
import { ArrowBendUpLeftIcon, ChatIcon, ClockIcon, HeartStraightIcon } from "phosphor-react-native";
import { memo, useMemo } from "react";
import { View } from "react-native";
import { useSnapshot } from "valtio";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
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

const CommentCard = memo(({ comment, isLast, parentId, replyingTo }: CommentCardProps) => {
  const newsId = typeof comment?.news === "string" ? comment?.news : comment?.news?.id;
  const { mutate } = useLikeComment(newsId, parentId);
  const auth = useSnapshot(authState);
  const route = useRoute();

  const avatarBg = useMemo(() => randomColor(), []);

  const navigation = useNavigation();

  if (!comment) {
    return null;
  }

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
    typeof user === "string" ? user === authState.user?.id : user?.id === authState.user?.id,
  );
  const isDisliked = comment.dislikes?.find((user) =>
    typeof user === "string" ? user === authState.user?.id : user?.id === authState.user?.id,
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
  };

  const commentUser = typeof comment.user === "object" ? comment.user : null;

  return (
    <View className="relative">
      <View className="flex-row gap-[10px] px-[10px]">
        <View
          className="h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: avatarBg }}
        >
          <Text className="text-[#fff] text-base">
            {(typeof comment.user === "object" && comment.user.username?.[0].toUpperCase()) ?? "U"}
          </Text>
        </View>

        <View className="flex-1 gap-2">
          <View className="flex-row items-center justify-between">
            <View className="gap-0">
              <Text className="font-bold text-[#0A0909]" variant="caption">
                {commentUser?.username
                  ? commentUser.username.charAt(0).toUpperCase() + commentUser.username.slice(1)
                  : "U"}{" "}
                {commentUser?.id === auth.session?.user?.id && "(You)"}
              </Text>

              <View className="flex-row items-center gap-1">
                <Icon color="#737373" name={ClockIcon} size={14} />
                <Text className="text-[#737373] text-sm">
                  {formatDistance(new Date(comment.createdAt), new Date(), {
                    addSuffix: true,
                  })}
                </Text>
              </View>
            </View>
          </View>

          <Text className="text-[#0A0909] text-[15px] leading-4.5">{comment.text}</Text>

          <View className="flex-row items-center gap-5">
            <Button
              className="flex-row items-center gap-1 p-0"
              feedbackVariant="none"
              onPress={onLike}
              size="sm"
              variant="ghost"
            >
              <Icon
                color={isLiked ? "#fb2d2d" : "#737373"}
                name={HeartStraightIcon}
                size={16}
                weight={isLiked ? "fill" : "regular"}
              />
              <Button.Label
                className={isLiked ? "text-[#fb2d2d] text-sm" : "text-[#737373] text-sm"}
              >
                {isLiked ? "Liked" : "Like"}
              </Button.Label>
            </Button>

            <Button className="p-0" feedbackVariant="none" onPress={onReply} variant="ghost">
              <Icon color="#737373" name={ArrowBendUpLeftIcon} size={16} />
              <Button.Label className="text-[#737373] text-sm">Reply</Button.Label>
            </Button>

            <Button
              className="flex-row items-center gap-1.5 p-0"
              feedbackVariant="none"
              isDisabled={isRepliesScreen}
              onPress={navigateToReplies}
              size="sm"
              variant="ghost"
            >
              <Icon color="#737373" name={ChatIcon} size={18} />
              <Button.Label className="text-[#737373] text-sm">
                {comment.totalReplies} Comment
                {(comment?.totalReplies ?? 0) > 1 ? "s" : ""}
              </Button.Label>
            </Button>
          </View>
        </View>

        <CommentOptionPopover comment={comment} />
      </View>

      <Separator className="my-3.5" />
    </View>
  );
});

export default CommentCard;
