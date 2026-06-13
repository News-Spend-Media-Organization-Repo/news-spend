import type { Comment } from "@news-spend-media/payload/types";
import { useNavigation, useRoute } from "@react-navigation/native";
import { ArrowBendUpLeft, ClockIcon, HeartStraightIcon } from "phosphor-react-native";
import { formatDistance } from "date-fns";
import { memo, useMemo } from "react";
import { View } from "react-native";
import { useSnapshot } from "valtio";

import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
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

const Reply = memo(({ comment }: CommentReplyProps) => {
  const route = useRoute();
  const { commentId: parentCommentId, newsId } = route.params as {
    commentId?: string;
    newsId?: string;
  };
  const { mutate } = useLikeComment(newsId);
  const auth = useSnapshot(authState);
  const navigation = useNavigation();

  const avatarBg = useMemo(() => randomColor(), []);

  const isLiked = comment.likes?.find((user) =>
    typeof user === "string" ? user === auth.user?.id : user?.id === auth.user?.id,
  );

  const parentComment = queryClient.getQueryData([
    orpc.comments.getComment.queryOptions({
      input: parentCommentId,
    }).queryKey,
  ]);

  const onReply = () => {
    setActiveComment(parentComment, comment);
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
    <View className="ml-10 px-2.5">
      <View className="flex-row">
        <View className="flex-1 flex-row gap-2.5">
          <View
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: avatarBg }}
          >
            <Text className="text-[#fff] text-base">
              {(typeof comment.user === "object" &&
                comment.user.username.charAt(0).toUpperCase()) ||
                "U"}
            </Text>
          </View>

          <View className="flex-1 gap-2">
            <View className="flex-row items-center justify-between">
              <View className="gap-0">
                <Text className="font-bold text-[#0A0909]" variant="subtitle">
                  {((typeof comment.user === "object" &&
                    comment.user.username.charAt(0).toUpperCase()) ||
                    "U") +
                    ((typeof comment.user === "object" && comment.user.username.slice(1)) ||
                      "Unknown")}{" "}
                  {(typeof comment.user !== "string" && comment.user?.id) === auth.user?.id &&
                    "(You)"}
                </Text>

                <View className="flex-row items-center gap-1">
                  <Icon name={ClockIcon} size={16} className="text-[#737373]" />
                  <Text className="text-[#737373] text-sm">
                    {formatDistance(new Date(comment.createdAt), new Date(), {
                      addSuffix: true,
                    })}
                  </Text>
                </View>
              </View>
            </View>

            <Text className="text-[#0A0909] text-[15px] leading-[18px]">{comment.text}</Text>

            <View className="flex-row items-center gap-5">
              <Button variant="ghost" className="flex-row items-center gap-1 p-0" onPress={onLike}>
                <Icon
                  name={HeartStraightIcon}
                  size={16}
                  className={isLiked ? "text-[#fb2d2d]" : "text-[#737373]"}
                  weight={isLiked ? "fill" : "bold"}
                />
                <Button.Label
                  className={isLiked ? "text-[#fb2d2d] text-sm" : "text-[#737373] text-sm"}
                >
                  {isLiked ? "Liked" : "Like"}
                </Button.Label>
              </Button>

              <Button variant="ghost" className="p-0" onPress={onReply}>
                <Icon name={ArrowBendUpLeft} size={16} className="text-[#737373]" />
                <Button.Label className="text-[#737373] text-[15px]">Reply</Button.Label>
              </Button>
            </View>
          </View>
        </View>

        <View className="items-center justify-between">
          <CommentOptionPopover comment={comment} />
        </View>
      </View>

      <View className="h-px bg-p-200 my-3.5" />
    </View>
  );
});

export default Reply;
