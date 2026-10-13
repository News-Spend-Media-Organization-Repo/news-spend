import { LegendList } from "@legendapp/list/react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  type InfiniteData,
  useInfiniteQuery,
  useQueries,
} from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns/formatDistanceToNowStrict";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  type TextInput,
  View,
} from "react-native";
import {
  KeyboardChatScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommentBox } from "#/components/CommentBox";
import CommentCard from "#/components/comment/CommentCard";
import { CommentEditScrim } from "#/components/comment/CommentEditScrim";
import { HighlightedReply } from "#/components/comment/HighlightedReply";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import CommentsMenuSheet from "#/components/sheets/CommentsMenuSheet";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import {
  CaretLeftIcon,
  DotsThreeVerticalIcon,
  HeartStraightIcon,
} from "#/lib/icons";
import { orpc, type RouterOutputs } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { useSafeBack } from "#/navigation/useSafeBack";
import { startReply } from "#/state/commentState";
import { BackArrow, CommentUnavailable } from "./CommentUnavailable";
import { isNotFoundError } from "./isNotFoundError";

const ThreadSeparator = () => <View className="h-px bg-[#ECECEE]" />;

function CommentReplies() {
  const insets = useSafeAreaInsets();
  const goBack = useSafeBack();
  const navigation = useNavigation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const renderScrollComponent = useCallback(
    (props: object) => (
      <KeyboardChatScrollView
        {...props}
        keyboardLiftBehavior="always"
        offset={composerHeight}
      />
    ),
    [composerHeight]
  );

  const { commentId, highlightCommentId, ...rest } = useRoute("CommentReply")
    .params as {
    commentId: string;
    highlightCommentId?: string;
    newsId?: string;
    newsSlug?: string;
    focus?: boolean;
  };
  const ref = useRef<TextInput>(null);
  const { isConnected } = useNetInfo();

  useEffect(() => {
    if (rest?.focus && ref.current) {
      const timeout = setTimeout(() => {
        ref.current?.focus();
      }, 100);

      return () => {
        clearTimeout(timeout);
      };
    }
  }, [rest?.focus]);
  const showHighlight =
    Boolean(highlightCommentId) && highlightCommentId !== commentId;

  // Shared helper to seed a single-comment query from the paginated all-comments
  // cache, avoiding a network round-trip when the comment was already loaded.
  const getCommentFromCache = (
    targetId: string
  ): RouterOutputs["comments"]["one"] | undefined => {
    if (!rest.newsId) {
      return;
    }
    const comments = queryClient.getQueryData<
      InfiniteData<RouterOutputs["comments"]["all"]>
    >(
      orpc.comments.all.infiniteKey({
        input: (pageParam) => ({
          newsId: rest.newsId,
          page: pageParam,
        }),
        initialPageParam: undefined,
      })
    );
    const found = comments?.pages
      .flatMap((page) => page.docs)
      .find((comment) => comment.id === targetId);
    if (!found) {
      return;
    }
    return {
      ...found,
      user: found.user ?? { id: "", username: "" },
    } as RouterOutputs["comments"]["one"];
  };

  const [rootCommentQuery, highlightedCommentQuery] = useQueries({
    queries: [
      orpc.comments.one.queryOptions({
        input: commentId,
        initialData: () => getCommentFromCache(commentId),
        initialDataUpdatedAt: () => {
          const qKey = orpc.comments.all.infiniteKey({
            input: (pageParam) => ({
              newsId: rest.newsId ?? "",
              page: pageParam,
            }),
            initialPageParam: undefined,
          });
          return queryClient.getQueryState(qKey)?.dataUpdatedAt;
        },
      }),
      orpc.comments.one.queryOptions({
        input: highlightCommentId ?? "",
        enabled: showHighlight,
        initialData: () =>
          highlightCommentId
            ? getCommentFromCache(highlightCommentId)
            : undefined,
      }),
    ],
  });

  const { data, isPending, isError, error, refetch } = rootCommentQuery;
  const effectiveNewsId =
    rest.newsId ??
    (typeof data?.news === "string" ? data?.news : data?.news?.id);

  const replies = useInfiniteQuery(
    orpc.comments.all.infiniteOptions({
      input: (pageParam: number | undefined) => ({
        // Guarded by `enabled` below, so it never actually fetches with "".
        newsId: effectiveNewsId ?? "",
        parentId: commentId,
        page: pageParam,
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      staleTime: 0,
      enabled: Boolean(effectiveNewsId),
    })
  );

  const onEndReached = () => {
    if (replies.hasNextPage && !replies.isFetchingNextPage) {
      replies.fetchNextPage();
    }
  };

  // The notification's target comment is pinned under the root header, so
  // drop it from the regular list to avoid rendering it twice.
  const allPages = (
    replies.data?.pages.flatMap((page) => page.docs) ?? []
  ).filter((item) => !showHighlight || item.id !== highlightCommentId);
  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(
    replies.refetch
  );

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <BackArrow onBack={goBack} />
        <ActivityIndicator />
      </View>
    );
  }

  // The API throws NOT_FOUND for a missing, hidden or removed comment. That is
  // a different state from a failed load, where a retry could succeed.
  if (isNotFoundError(error) || !(isError || data)) {
    const slug = rest.newsSlug;

    return (
      <CommentUnavailable
        action={
          slug
            ? {
                label: "View the article",
                onPress: () => navigation.navigate("News", { slug }),
              }
            : undefined
        }
        message="It may have been removed by its author or a moderator."
        onBack={goBack}
        title="This comment is no longer available"
      />
    );
  }

  if (isError || !data) {
    return (
      <CommentUnavailable
        action={{ label: "Try again", onPress: () => refetch() }}
        message="Check your connection and try again."
        onBack={goBack}
        title="Something went wrong"
      />
    );
  }

  const parentUser = typeof data.user === "object" ? data.user : null;
  const parentName = parentUser?.username
    ? parentUser.username.charAt(0).toUpperCase() + parentUser.username.slice(1)
    : "User";
  const replyCount = data.totalReplies ?? allPages.length;

  return (
    <Screen
      contentContainerClassName="pt-safe"
      disableKeyboardAvoidingView
      statusBarStyle="auto"
    >
      <View style={{ flex: 1 }}>
        <View className="flex-row items-center justify-between px-4 py-1.5">
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            hitSlop={14}
            onPress={goBack}
          >
            <Icon color="#18181B" name={CaretLeftIcon} size={22} />
          </Pressable>
          <Pressable
            accessibilityLabel="More options"
            accessibilityRole="button"
            hitSlop={14}
            onPress={() => setMenuOpen(true)}
          >
            <Icon color="#18181B" name={DotsThreeVerticalIcon} size={20} />
          </Pressable>
        </View>

        <View className="gap-1.5 px-5 pt-1.5 pb-4">
          <Text className="font-bold text-[30px] text-foreground leading-[34px]">
            Replies
          </Text>
          <Text className="text-[#71717A] text-[13px]">
            to {parentName} · {replyCount}{" "}
            {replyCount === 1 ? "reply" : "replies"}
          </Text>
        </View>

        {/* The comment being replied to, quoted behind a rule rather than
            boxed — it is context, not another row in the list. */}
        <View className="flex-row gap-3.5 px-5 pb-4">
          <View className="w-0.5 rounded-full bg-s-300" />
          <View className="flex-1 gap-1.5">
            <View className="flex-row items-center gap-2">
              <Text className="font-bold text-[15px] text-foreground">
                {parentName}
              </Text>
              <Text className="text-[#A1A1AA] text-xs">
                {formatDistanceToNowStrict(new Date(data.createdAt), {
                  addSuffix: true,
                })}
              </Text>
            </View>
            <Text className="text-[15px] text-foreground leading-[23px]">
              {data.text}
            </Text>
            <View className="flex-row items-center gap-1.5 pt-0.5">
              <Icon
                color={data.userReaction === "like" ? "#ECB365" : "#A1A1AA"}
                name={HeartStraightIcon}
                size={15}
                weight={data.userReaction === "like" ? "fill" : "regular"}
              />
              <Text className="text-[#71717A] text-xs">
                {data.likesCount ?? 0}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row items-center gap-3 px-5 pb-1">
          <View className="h-px flex-1 bg-[#ECECEE]" />
          <Text className="font-bold text-[#A1A1AA] text-[10px] tracking-wider">
            {replyCount} {replyCount === 1 ? "REPLY" : "REPLIES"}
          </Text>
          <View className="h-px flex-1 bg-[#ECECEE]" />
        </View>

        <LegendList
          contentContainerStyle={{ paddingBottom: composerHeight + 8 }}
          data={allPages}
          ItemSeparatorComponent={ThreadSeparator}
          keyExtractor={(item) => (typeof item === "string" ? item : item.id)}
          ListEmptyComponent={
            replies.isLoading ? (
              <View className="py-6">
                <ActivityIndicator />
              </View>
            ) : showHighlight ? null : (
              <View className="items-center py-10">
                <Text className="text-[#71717A] text-sm">No replies yet</Text>
              </View>
            )
          }
          ListFooterComponent={
            replies.isFetchingNextPage ? (
              <View className="py-4">
                <ActivityIndicator />
              </View>
            ) : null
          }
          ListHeaderComponent={
            showHighlight && highlightedCommentQuery.data ? (
              <HighlightedReply
                comment={highlightedCommentQuery.data}
                inputRef={ref}
              />
            ) : null
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onRefresh={refetchByUser}
          recycleItems={false}
          refreshing={isRefetchingByUser && !replies.isFetchingNextPage}
          renderItem={({ item }) => (
            <CommentCard
              comment={item}
              onReplyPress={() => {
                startReply(item, data);
                ref.current?.focus();
              }}
              parentId={commentId}
              variant="thread"
            />
          )}
          renderScrollComponent={renderScrollComponent}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        />

        <CommentEditScrim />

        <View className="h-px bg-[#ECECEE]" />
        {/*
          The bottom safe-area inset lives on the composer, not on Screen.
          As Screen padding it was a transparent strip *below* the composer:
          the keyboard lifted the composer off it, leaving a gap above the
          keyboard and a window the list scrolled through. Owning it here
          keeps the strip opaque and part of the composer, and the `opened`
          offset drops it behind the keyboard so the input sits flush.
        */}
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View
            className="bg-surface"
            onLayout={(e) =>
              setComposerHeight(Math.ceil(e.nativeEvent.layout.height))
            }
            style={{ paddingBottom: insets.bottom }}
          >
            <CommentBox
              inputRef={ref}
              newsId={
                typeof data?.news === "string" ? data?.news : data?.news?.id
              }
            />
          </View>
        </KeyboardStickyView>
      </View>

      <CommentsMenuSheet onOpenChange={setMenuOpen} open={menuOpen} />
    </Screen>
  );
}

export default CommentReplies;
