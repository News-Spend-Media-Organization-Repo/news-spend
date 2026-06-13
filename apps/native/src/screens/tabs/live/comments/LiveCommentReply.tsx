import { useNavigation } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeftIcon } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { ActivityIndicator, type TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { CommentBox } from "#/components/CommentBox";
import CommentCard from "#/components/comment/CommentCard";
import Reply from "#/components/comment/Reply";
import { EditCommentBox } from "#/components/EditCommentBox";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc, type RouterOutputs } from "#/lib/orpc";

function LiveCommentReply({ route }) {
  const navigation = useNavigation();
  const { commentId, ...rest } = route.params;
  const queryClient = useQueryClient();

  const ref = useRef<TextInput>(null);
  const editRef = useRef<TextInput>(null);

  useEffect(() => {
    if (route.params?.focus && ref.current) {
      const timeout = setTimeout(() => {
        ref.current?.focus();
      }, 100);

      return () => {
        clearTimeout(timeout);
      };
    }
  }, [route?.params?.focus]);

  const { data, isPending, isError } = useQuery(
    orpc.comments.one.queryOptions({
      input: commentId,
      initialData: () => {
        // const comments = utils.comments.all.getInfiniteData({
        //   newsId: rest.newsId,
        // });
        const comments = queryClient.getQueryData<InfiniteData<RouterOutputs["comments"]["all"]>>(
          orpc.comments.all.infiniteKey({
            input: () => ({ newsId: rest.newsId }),
            initialPageParam: undefined,
          }),
        );
        const comment = comments?.pages
          .flatMap((page) => page.docs)
          ?.find((comment) => comment.id === commentId);
        return comment;
      },
      initialDataUpdatedAt: () => {
        const qKey = orpc.comments.all.infiniteKey({
          input: () => ({ newsId: rest.newsId }),
          initialPageParam: undefined,
        });
        return queryClient.getQueryState(qKey)?.dataUpdatedAt;
      },
    }),
  );

  const replies = useInfiniteQuery(
    orpc.comments.all.infiniteOptions({
      input: (pageParam: number | undefined) => ({
        newsId: rest.newsId,
        parentId: commentId,
        pageParam,
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      staleTime: 0,
      gcTime: 0,
    }),
  );
  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(replies.refetch);

  if (isError) {
    return (
      <Screen>
        <View className="mt-2.5 flex-1 px-2.5">
          <Text className="text-center">Something went wrong</Text>
        </View>
      </Screen>
    );
  }

  const onEndReached = () => {
    if (replies.hasNextPage && !replies.isFetchingNextPage) {
      replies.fetchNextPage();
    }
  };

  if (replies.isLoading) {
    return <ActivityIndicator className="text-p-300" />;
  }

  const allPages = replies.data?.pages.flatMap((page) => page.docs) ?? [];

  return (
    <Screen safeAreaEdges={["bottom", "top"]}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={50} style={{ flex: 1 }}>
        <View className="flex-1 px-2.5">
          <Button
            className="h-auto flex-row items-center justify-start gap-2 p-0"
            onPress={() => navigation.goBack()}
            variant="ghost"
          >
            <Icon className="text-black" name={ArrowLeftIcon} size={30} />
            <Button.Label className="text-[15px]">
              {data?.totalReplies}
              {(data?.totalReplies ?? 0) > 1 ? " Replies" : " Reply"}
            </Button.Label>
          </Button>
          <FlashList
            contentContainerStyle={{ paddingBottom: 50 }}
            data={allPages}
            keyExtractor={(item) => (typeof item === "string" ? item : item.id)}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center">
                <Text>No replies yet</Text>
              </View>
            }
            ListFooterComponent={replies.isFetchingNextPage ? <ActivityIndicator /> : null}
            ListHeaderComponent={<CommentCard comment={data} />}
            ListHeaderComponentStyle={{ marginVertical: 15 }}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            onRefresh={refetchByUser}
            refreshing={isRefetchingByUser && !replies.isFetchingNextPage}
            renderItem={({ item }) => <Reply comment={item} />}
            showsVerticalScrollIndicator={false}
          />
        </View>
        <CommentBox
          inputRef={ref}
          newsId={typeof data?.news === "string" ? data?.news : data?.news?.id}
        />
        <EditCommentBox inputRef={editRef} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

export default LiveCommentReply;
