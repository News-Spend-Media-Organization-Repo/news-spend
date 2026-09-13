import { useNavigation, useRoute } from "@react-navigation/native";
import { formatDistanceToNowStrict } from "date-fns/formatDistanceToNowStrict";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { useSnapshot } from "valtio";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import useLikeComment from "#/hooks/comments/useLikeComment";
import { HeartStraightIcon } from "#/lib/icons";
import type { RouterOutputs } from "#/lib/orpc";
import { authState } from "#/state/auth";
import CommentOptionPopover from "./CommentOptionPopover";

type Comment = RouterOutputs["comments"]["one"];

type PreviewReply = {
  id: string;
  text: string;
  createdAt: string;
  likesCount?: number | null;
  user?: { id: string; username?: string } | string | null;
};

type CommentCardProps = {
  comment: Comment & { previewReplies?: PreviewReply[] };
  parentId?: string;
  /** Replies render flat inside a thread; only the list screen nests them. */
  variant?: "list" | "thread";
  /**
   * Overrides what Reply does. On the thread screen replying should focus the
   * composer already on screen rather than pushing another thread onto it.
   */
  onReplyPress?: () => void;
};

/** Short relative time — "2mo", not "about 2 months ago". */
function shortTime(date: string) {
  return formatDistanceToNowStrict(new Date(date), { addSuffix: false })
    .replace(" seconds", "s")
    .replace(" second", "s")
    .replace(" minutes", "m")
    .replace(" minute", "m")
    .replace(" hours", "h")
    .replace(" hour", "h")
    .replace(" days", "d")
    .replace(" day", "d")
    .replace(" months", "mo")
    .replace(" month", "mo")
    .replace(" years", "y")
    .replace(" year", "y");
}

function displayName(user: PreviewReply["user"]) {
  const name = typeof user === "object" && user ? user.username : undefined;
  if (!name) {
    return "User";
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function initial(user: PreviewReply["user"]) {
  return displayName(user).charAt(0).toUpperCase();
}

const CommentCard = memo(
  ({ comment, parentId, variant = "list", onReplyPress }: CommentCardProps) => {
    const newsId =
      typeof comment?.news === "string" ? comment?.news : comment?.news?.id;
    const { mutate } = useLikeComment(newsId, parentId);
    const auth = useSnapshot(authState);
    const route = useRoute();
    const navigation = useNavigation();

    if (!comment) {
      return null;
    }

    const commentUser = typeof comment.user === "object" ? comment.user : null;
    const isLiked = comment.userReaction === "like";
    const isYou = commentUser?.id === auth.session?.user?.id;
    const previews = comment.previewReplies ?? [];
    const totalReplies = comment.totalReplies ?? 0;
    const hasMore = totalReplies > previews.length;

    const goToThread = () =>
      navigation.navigate("CommentReply", {
        commentId: comment.id,
        newsId,
        newsSlug: route.params?.newsSlug as string,
      });

    const onLike = () => {
      if (!authState.user || authState.user.isAnonymous) {
        navigation.navigate("SignIn", { redirect: route.name });
        return;
      }
      mutate(comment.id);
    };

    const onReply = () => {
      if (onReplyPress) {
        onReplyPress();
        return;
      }
      navigation.navigate("CommentReply", {
        commentId: comment.id,
        newsId,
        newsSlug: route.params?.newsSlug as string,
        focus: true,
      });
    };

    return (
      <View className="gap-2 px-5 py-4">
        <View className="flex-row items-center gap-2.5">
          <View className="size-[30px] items-center justify-center rounded-full border border-[#ECECEE] bg-background">
            <Text className="font-bold text-[#3F3F46] text-xs">
              {initial(commentUser)}
            </Text>
          </View>

          <View className="flex-1 flex-row items-center gap-1.5">
            <Text className="font-semibold text-[15px] text-foreground">
              {displayName(commentUser)}
            </Text>
            {isYou && (
              <Text className="font-semibold text-[#6B4E22] text-xs">you</Text>
            )}
          </View>

          <Text className="text-[#A1A1AA] text-xs">
            {shortTime(comment.createdAt)}
          </Text>
          <CommentOptionPopover comment={comment} />
        </View>

        <Text className="text-[#3F3F46] text-[15px] leading-[23px]">
          {comment.text}
        </Text>

        <View className="flex-row items-center gap-5 pt-0.5">
          <Pressable
            accessibilityLabel={isLiked ? "Unlike comment" : "Like comment"}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5"
            hitSlop={8}
            onPress={onLike}
          >
            <Icon
              color={isLiked ? "#ECB365" : "#A1A1AA"}
              name={HeartStraightIcon}
              size={15}
              weight={isLiked ? "fill" : "regular"}
            />
            <Text
              className={
                isLiked
                  ? "font-semibold text-[#6B4E22] text-xs"
                  : "text-[#71717A] text-xs"
              }
            >
              {comment.likesCount ?? 0}
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Reply to comment"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onReply}
          >
            <Text className="font-semibold text-[#71717A] text-xs">Reply</Text>
          </Pressable>
        </View>

        {variant === "list" && previews.length > 0 && (
          <View className="flex-row gap-3.5 pt-2">
            {/* The thread's only affordance: one hairline, no avatars, no
                indent boxes. Replies read as a continuation of the comment. */}
            <View className="w-px bg-[#ECECEE]" />
            <View className="flex-1 gap-3.5">
              {previews.map((reply) => (
                <View className="gap-1" key={reply.id}>
                  <View className="flex-row items-center gap-1.5">
                    <Text className="font-semibold text-foreground text-sm">
                      {displayName(reply.user)}
                    </Text>
                    <Text className="text-[#A1A1AA] text-[11px]">
                      {shortTime(reply.createdAt)}
                    </Text>
                  </View>
                  <Text className="text-[#3F3F46] text-sm leading-[21px]">
                    {reply.text}
                  </Text>
                </View>
              ))}

              {hasMore && (
                <Pressable
                  accessibilityLabel={`View all ${totalReplies} replies`}
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={goToThread}
                >
                  <Text className="font-semibold text-p-500 text-xs">
                    View all {totalReplies} replies →
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>
    );
  }
);

CommentCard.displayName = "CommentCard";

export default CommentCard;
