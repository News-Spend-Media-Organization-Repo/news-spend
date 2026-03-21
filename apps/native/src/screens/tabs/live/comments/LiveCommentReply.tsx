import { useNavigation } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { ArrowLeft } from "@tamagui/lucide-icons";
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { TextInput } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Paragraph, Spinner, Stack, YStack } from "tamagui";

import CommentCard from "#/components/comment/CommentCard";
import Reply from "#/components/comment/Reply";
import { CommentBox } from "#/components/CommentBox";
import { EditCommentBox } from "#/components/EditCommentBox";
import { Screen } from "#/components/Screen";
import { Button, Text } from "#/components/ui";
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
        const comments = queryClient.getQueryData<
          InfiniteData<RouterOutputs["comments"]["all"]>
        >(
          orpc.comments.all.infiniteKey({
            input: () => ({ newsId: rest.newsId }),
            initialPageParam: undefined,
          })
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
    })
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
    })
  );
  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(
    replies.refetch
  );

  if (isError) {
    return (
      <Screen>
        <Stack flex={1} mt={10} px={10}>
          <Paragraph textAlign="center">Something went wrong</Paragraph>
        </Stack>
      </Screen>
    );
  }

  const onEndReached = () => {
    if (replies.hasNextPage && !replies.isFetchingNextPage) {
      replies.fetchNextPage();
    }
  };

  if (replies.isLoading) {
    return <Spinner color="$p300" />;
  }

  const allPages = replies.data?.pages.flatMap((page) => page.docs) ?? [];

  return (
    <Screen safeAreaEdges={["bottom", "top"]}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={50}
        style={{ flex: 1 }}
      >
        <Stack flex={1} px={10}>
          <Button
            ai="center"
            gap="$2"
            ghost
            h="auto"
            jc="flex-start"
            onPress={() => navigation.goBack()}
            p="$0"
          >
            <Button.Icon color="black">
              <ArrowLeft size={30} />
            </Button.Icon>
            <Button.Text>
              <Text fos="$5">
                {data?.totalReplies}
                {(data?.totalReplies ?? 0) > 1 ? " Replies" : " Reply"}
              </Text>
            </Button.Text>
          </Button>
          <FlashList
            contentContainerStyle={{ paddingBottom: 50 }}
            data={allPages}
            keyExtractor={(item) => (typeof item === "string" ? item : item.id)}
            ListEmptyComponent={
              <YStack ai="center" flex={1} jc="center">
                <Paragraph>No replies yet</Paragraph>
              </YStack>
            }
            ListFooterComponent={
              replies.isFetchingNextPage ? <Spinner /> : null
            }
            ListHeaderComponent={<CommentCard comment={data} ref={ref} />}
            ListHeaderComponentStyle={{ marginVertical: 15 }}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            onRefresh={refetchByUser}
            refreshing={isRefetchingByUser && !replies.isFetchingNextPage}
            renderItem={({ item }) => <Reply comment={item} ref={ref} />}
            showsVerticalScrollIndicator={false}
          />
        </Stack>
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
