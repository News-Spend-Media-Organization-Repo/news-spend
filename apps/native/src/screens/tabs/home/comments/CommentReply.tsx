import { useNetInfo } from "@react-native-community/netinfo";
import { useNavigation, useRoute } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { ArrowLeft } from "@tamagui/lucide-icons";
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { TextInput } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Paragraph, Spinner, YStack } from "tamagui";

import CommentCard from "#/components/comment/CommentCard";
import Reply from "#/components/comment/Reply";
import { CommentBox } from "#/components/CommentBox";
import { EditCommentBox } from "#/components/EditCommentBox";
import { Screen } from "#/components/Screen";
import { Button, Text } from "#/components/ui";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc, type RouterOutputs } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

function CommentReplies() {
  const { commentId, ...rest } = useRoute().params;
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

  const onEndReached = () => {
    if (replies.hasNextPage && !replies.isFetchingNextPage) {
      replies.fetchNextPage();
    }
  };

  const navigation = useNavigation();

  const allPages = replies.data?.pages.flatMap((page) => page.docs) ?? [];
  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(
    replies.refetch
  );
  const insets = useSafeAreaInsetsStyle(["top"]);

  console.log(useSafeAreaInsets());

  if (isPending) {
    return (
      <YStack ai="center" flex={1} justifyContent="center">
        <Spinner />
      </YStack>
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
    <Screen safeAreaEdges={["bottom"]}>
      <KeyboardAvoidingView
        behavior="padding"
        // keyboardVerticalOffset={50}
        style={{ flex: 1 }}
      >
        <FlashList
          contentContainerStyle={{ paddingBottom: 50, paddingTop: 20 }}
          data={allPages}
          keyExtractor={(item) => (typeof item === "string" ? item : item.id)}
          ListEmptyComponent={
            replies.isLoading ? (
              <Spinner />
            ) : (
              <YStack ai="center" flex={1} jc="center">
                <Paragraph>No replies yet</Paragraph>
              </YStack>
            )
          }
          ListFooterComponent={replies.isFetchingNextPage ? <Spinner /> : null}
          ListHeaderComponent={
            <>
              <Button
                ai="center"
                gap="$2"
                ghost
                h="auto"
                jc="flex-start"
                mb="$4"
                mx={10}
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
              <CommentCard comment={data} ref={ref} />
            </>
          }
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
