import type { Comment } from "@nsm/payload/payload-types";
import { useNavigation } from "@react-navigation/native";
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
import { Button, Image, Text } from "#/components/ui";
import useGetComments from "#/hooks/comments/useGetComments";
import { useFocusBackHandler } from "#/hooks/useBackHandler";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";
import { getImageData } from "#/utils/getImageData";

const LiveComments = ({ route }) => {
  const queryClient = useQueryClient();
  const { newsId, newsSlug } = route.params;
  const navigation = useNavigation();
  const {
    data,
    isPending,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    isLoading,
  } = useGetComments(newsId, false);
  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);
  // input ref
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

  useFocusBackHandler(() => {
    if (ref.current?.isFocused()) {
      ref.current.blur();
      return true;
    }
    return false;
  });

  const news = useQuery(
    orpc.news.one.queryOptions({
      input: {
        slug: newsSlug,
        type: "video",
      },
      initialData: () =>
        queryClient.getQueryData(
          orpc.news.one.queryKey({ input: { slug: newsSlug, type: "video" } })
        ),
      initialDataUpdatedAt: () => {
        const qKey = orpc.news.one.queryKey({
          input: { slug: newsSlug, type: "video" },
        });

        return queryClient.getQueryState(qKey)?.dataUpdatedAt;
      },
    })
  );

  const onEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const renderItem: ListRenderItem<Comment> = useCallback(
    ({ item }) => <CommentCard comment={item} ref={ref} />,
    [data]
  );

  if (isError) {
    return (
      <Screen>
        <Stack ai="center" flex={1} jc="center">
          <Text>Something went wrong</Text>
        </Stack>
      </Screen>
    );
  }

  if (isLoading) {
    return <Spinner color="$p300" />;
  }

  const allPages = data?.pages.flatMap((page) => page?.docs) ?? [];
  const { url, blurhash } = getImageData(news.data?.image);

  return (
    <Screen
      // keyboardOffset={200}
      preset="fixed"
      safeAreaEdges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={50}
        style={{ flex: 1 }}
      >
        <FlashList
          contentContainerStyle={{ paddingBottom: 60, paddingTop: 0 }}
          data={allPages}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <YStack ai="center" flex={1} jc="center">
              <Paragraph>No comments yet</Paragraph>
            </YStack>
          }
          ListFooterComponent={
            isFetchingNextPage ? <Spinner color="$p300" /> : null
          }
          ListHeaderComponent={
            <YStack gap="$5" mb="$6">
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
                <Stack flex={1} px="$2.5">
                  <Paragraph numberOfLines={3}>{news.data?.title}</Paragraph>
                </Stack>
              </XStack>

              <H3 fontWeight="400" pl="$4">
                Comments ({news.data?.totalComments ?? 0})
              </H3>
            </YStack>
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onRefresh={refetchByUser}
          refreshing={isRefetchingByUser}
          // ItemSeparatorComponent={() => <Separator bw={10} boc="transparent" />}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
        <CommentBox inputRef={ref} newsId={newsId!} newsSlug={newsSlug} />
        <EditCommentBox inputRef={editRef} />
      </KeyboardAvoidingView>
    </Screen>
  );
};

export default LiveComments;
