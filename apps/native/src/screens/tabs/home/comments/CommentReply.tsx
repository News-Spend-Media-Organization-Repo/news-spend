import { LegendList } from "@legendapp/list/react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation, useRoute } from "@react-navigation/native";
import { type InfiniteData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ActivityIndicator, type TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { CommentBox } from "#/components/CommentBox";
import CommentCard from "#/components/comment/CommentCard";
import Reply from "#/components/comment/Reply";
import { EditCommentBox } from "#/components/EditCommentBox";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc, type RouterOutputs } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";

function CommentReplies() {
  const { commentId, ...rest } = useRoute("CommentReply").params;
  const ref = useRef<TextInput>(null);
  const editRef = useRef<TextInput>(null);
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
  const { data, isPending, isError } = useQuery(
    orpc.comments.one.queryOptions({
      input: commentId,
      initialData: () => {
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
        page: pageParam,
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      staleTime: 0,
    }),
  );

  const onEndReached = () => {
    if (replies.hasNextPage && !replies.isFetchingNextPage) {
      replies.fetchNextPage();
    }
  };

  const navigation = useNavigation();

  const allPages = replies.data?.pages.flatMap((page) => page.docs) ?? [];
  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(replies.refetch);

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  // if ((isError || replies.isError) && isConnected) {
  //   return (
  //     <Screen>
  //       <Stack flex={1} px={10} mt={10}>
  //         <Paragraph textAlign="center">Something went wrong</Paragraph>
  //       </Stack>
  //     </Screen>
  //   );
  // }

  return (
    <Screen contentContainerClassName="py-safe" disableKeyboardAvoidingView systemBarStyle="auto">
      <KeyboardAvoidingView
        behavior="padding"
        // keyboardVerticalOffset={50}
        style={{ flex: 1 }}
      >
        <LegendList
          data={allPages}
          keyExtractor={(item) => (typeof item === "string" ? item : item.id)}
          ListEmptyComponent={
            replies.isLoading ? (
              <ActivityIndicator />
            ) : (
              <View className="flex-1 items-center justify-center">
                <Text>No replies yet</Text>
              </View>
            )
          }
          ListFooterComponent={replies.isFetchingNextPage ? <ActivityIndicator /> : null}
          ListHeaderComponent={<CommentCard comment={data} ref={ref} />}
          ListHeaderComponentStyle={{ marginVertical: 15 }}
          // showsVerticalScrollIndicator={false}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onRefresh={refetchByUser}
          refreshing={isRefetchingByUser && !replies.isFetchingNextPage}
          renderItem={({ item }) => <Reply comment={item} ref={ref} />}
          // ItemSeparatorComponent={() => <Stack h={15} />}
        />
        <CommentBox
          inputRef={ref}
          newsId={typeof data?.news === "string" ? data?.news : data?.news?.id}
        />
        <EditCommentBox inputRef={editRef} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

export default CommentReplies;
