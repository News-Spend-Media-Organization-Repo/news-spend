import { LegendList } from "@legendapp/list/react-native";
import { useNavigation } from "@react-navigation/native";
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeftIcon } from "phosphor-react-native";
import { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, type TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { CommentBox } from "#/components/CommentBox";
import CommentCard from "#/components/comment/CommentCard";
import { HighlightedReply } from "#/components/comment/HighlightedReply";
import Reply from "#/components/comment/Reply";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc, type RouterOutputs } from "#/lib/orpc";

function LiveCommentReply({ route }) {
  const navigation = useNavigation();
  const { commentId, newsId, newsSlug, slug, highlightCommentId } =
    route.params;
  const queryClient = useQueryClient();

  const ref = useRef<TextInput>(null);

  useEffect(() => {
    if (route.params?.focus && ref.current) {
      const timeout = setTimeout(() => ref.current?.focus(), 100);
      return () => clearTimeout(timeout);
    }
  }, [route?.params?.focus]);

  const { data, isError } = useQuery(
    orpc.comments.one.queryOptions({
      input: commentId,
      initialData: () => {
        const comments = queryClient.getQueryData<
          InfiniteData<RouterOutputs["comments"]["all"]>
        >(
          orpc.comments.all.infiniteKey({
            input: (pageParam) => ({ newsId, page: pageParam }),
            initialPageParam: undefined,
          })
        );
        const found = comments?.pages
          .flatMap((page) => page.docs)
          .find((comment) => comment.id === commentId);
        if (!found) {
          return;
        }
        return {
          ...found,
          user: found.user ?? { id: "", username: "" },
        } as RouterOutputs["comments"]["one"];
      },
      initialDataUpdatedAt: () => {
        const qKey = orpc.comments.all.infiniteKey({
          input: (pageParam) => ({ newsId, page: pageParam }),
          initialPageParam: undefined,
        });
        return queryClient.getQueryState(qKey)?.dataUpdatedAt;
      },
    })
  );

  const effectiveNewsId =
    newsId ?? (typeof data?.news === "string" ? data?.news : data?.news?.id);
  const effectiveNewsSlug = newsSlug ?? slug;

  const replies = useInfiniteQuery(
    orpc.comments.all.infiniteOptions({
      input: (pageParam: number | undefined) => ({
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

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(
    replies.refetch
  );

  const onEndReached = useCallback(() => {
    if (replies.hasNextPage && !replies.isFetchingNextPage) {
      replies.fetchNextPage();
    }
  }, [replies.hasNextPage, replies.isFetchingNextPage, replies.fetchNextPage]);

  const renderItem = useCallback(
    ({ item }) => <Reply comment={item} inputRef={ref} />,
    [] // ref is stable, no deps needed
  );

  if (isError) {
    return (
      <Screen>
        <View className="mt-2.5 flex-1 px-2.5">
          <Text className="text-center">Something went wrong</Text>
        </View>
      </Screen>
    );
  }

  if (replies.isPending) {
    return <ActivityIndicator className="text-p-300" />;
  }

  // The notification's target comment is pinned under the root header, so
  // drop it from the regular list to avoid rendering it twice.
  const showHighlight =
    Boolean(highlightCommentId) && highlightCommentId !== commentId;
  const allPages = (
    replies.data?.pages.flatMap((page) => page.docs) ?? []
  ).filter((item) => !showHighlight || item.id !== highlightCommentId);
  const newsIdForComposer =
    typeof data?.news === "string" ? data?.news : data?.news?.id;

  return (
    <Screen contentContainerClassName="py-safe" disableKeyboardAvoidingView>
      <View className="flex-1 px-2.5">
        <Button
          className="h-auto flex-row items-center justify-start gap-2 p-0"
          hitSlop={10}
          onPress={() => navigation.goBack()}
          variant="ghost"
        >
          <Icon name={ArrowLeftIcon} size={20} />
          <Button.Label className="text-[15px]">
            {data?.totalReplies ?? 0}{" "}
            {(data?.totalReplies ?? 0) === 1 ? "Reply" : "Replies"}
          </Button.Label>
        </Button>

        <LegendList
          contentContainerStyle={{ paddingBottom: 50 }}
          data={allPages}
          keyExtractor={(item) => (typeof item === "string" ? item : item.id)}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center">
              <Text>No replies yet</Text>
            </View>
          }
          ListFooterComponent={
            replies.isFetchingNextPage ? <ActivityIndicator /> : null
          }
          ListHeaderComponent={
            <>
              <CommentCard comment={data} screenType="live" />
              {showHighlight && highlightCommentId ? (
                <HighlightedReply
                  commentId={highlightCommentId}
                  inputRef={ref}
                />
              ) : null}
            </>
          }
          ListHeaderComponentStyle={{ marginVertical: 15 }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onRefresh={refetchByUser}
          refreshing={isRefetchingByUser && !replies.isFetchingNextPage}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      </View>

      <KeyboardStickyView offset={{ closed: 0, opened: 20 }}>
        <View className="pb-safe">
          <CommentBox
            inputRef={ref}
            newsId={newsIdForComposer}
            newsSlug={effectiveNewsSlug}
          />
        </View>
      </KeyboardStickyView>
    </Screen>
  );
}

export default LiveCommentReply;
