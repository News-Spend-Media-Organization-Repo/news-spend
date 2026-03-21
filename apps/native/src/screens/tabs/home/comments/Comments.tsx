import type { Comment } from "@news-spend-media/payload/types";
import { useNavigation, useRoute } from "@react-navigation/native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import type { TextInput } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { H3, Paragraph, Spinner, Stack, XStack, YStack } from "tamagui";
import { CaretDown } from "tamagui-phosphor";

import CommentCard from "#/components/comment/CommentCard";
import { EditCommentBox } from "#/components/EditCommentBox";
import { CommentBox } from "#/components/index";
import { Screen } from "#/components/Screen";
import { Button, Image } from "#/components/ui";
import useGetComments from "#/hooks/comments/useGetComments";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";
import { getImageData } from "#/utils/getImageData";

const Comments = () => {
  const queryClient = useQueryClient();
  const route = useRoute();
  const params = route.params as
    | { newsId?: string; newsSlug?: string; focus?: boolean }
    | undefined;
  const { newsId, newsSlug } = params ?? {};

  const news = useQuery(
    orpc.news.one.queryOptions({
      input: {
        slug: newsSlug,
        type: "article",
      },
      initialData: () =>
        queryClient.getQueryData(
          orpc.news.one.queryKey({ input: { slug: newsSlug, type: "article" } })
        ),
      initialDataUpdatedAt: () => {
        const qKey = orpc.news.one.queryKey({
          input: {
            slug: newsSlug,
            type: "article",
          },
        });

        return queryClient.getQueryState(qKey)?.dataUpdatedAt;
      },
    })
  );
  const { data, fetchNextPage, isFetchingNextPage, hasNextPage, refetch } =
    useGetComments(newsId, false);

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  const navigation = useNavigation();

  // input ref
  const ref = useRef<TextInput>(null);
  const editRef = useRef<TextInput>(null);
  useEffect(() => {
    if (params?.focus && ref.current) {
      const timeout = setTimeout(() => {
        ref.current?.focus();
      }, 100);

      return () => {
        clearTimeout(timeout);
      };
    }
  }, [params?.focus]);

  const renderItem: ListRenderItem<Comment> = useCallback(
    ({ item }: { item: Comment }) => <CommentCard comment={item} ref={ref} />,
    [ref]
  );

  const onEndReached = useCallback(() => {
    if (isFetchingNextPage || !hasNextPage) return;
    fetchNextPage();
  }, [isFetchingNextPage, fetchNextPage, hasNextPage]);

  const keyExtractor = useCallback((item) => item.id, []);

  // if ((news.isError || isError) && isConnected) {
  //   return (
  //     <YStack flex={1} justifyContent="center" ai="center">
  //       <Text>An error occurred</Text>
  //     </YStack>
  //   );
  // }

  if (news.isPending) {
    return (
      <YStack ai="center" flex={1} justifyContent="center">
        <Spinner />
      </YStack>
    );
  }

  const allPages = data?.pages.flatMap((page) => page.docs) || [];
  const { url, blurhash } = getImageData(news.data?.image);

  return (
    <Screen safeAreaEdges={["bottom"]}>
      <KeyboardAvoidingView
        behavior="padding"
        // keyboardVerticalOffset={10}
        style={{ flex: 1 }}
      >
        <FlashList
          contentContainerStyle={{ paddingTop: 20 }}
          data={allPages}
          keyExtractor={keyExtractor}
          ListEmptyComponent={
            <YStack ai="center" flex={1} jc="center">
              <Paragraph>No comments yet</Paragraph>
            </YStack>
          }
          ListFooterComponent={isFetchingNextPage ? <Spinner /> : null}
          ListHeaderComponent={
            <YStack gap="$3" mb="$6">
              <XStack ai="center" px="$2">
                <Button ghost onPress={() => navigation.goBack()}>
                  <Button.Icon color="black">
                    <CaretDown size={24} />
                  </Button.Icon>
                </Button>
                <Image
                  borderRadius={10}
                  contentFit="cover"
                  minHeight={60}
                  placeholder={{
                    blurhash,
                  }}
                  source={url}
                  w={60}
                />
                <Stack als="flex-start" flex={1} px="$2.5">
                  <Paragraph numberOfLines={3}>{news.data?.title}</Paragraph>
                </Stack>
              </XStack>

              <H3 fontWeight="400" my="$2" pl="$4">
                Comments ({allPages?.length ?? 0})
              </H3>
            </YStack>
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onRefresh={refetchByUser}
          refreshing={isRefetchingByUser}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
        <CommentBox inputRef={ref} newsId={newsId} newsSlug={newsSlug} />
        <EditCommentBox inputRef={editRef} />
      </KeyboardAvoidingView>
    </Screen>
  );
};

export default Comments;
