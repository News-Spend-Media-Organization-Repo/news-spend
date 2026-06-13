import type { Comment } from "@nsm/payload/payload-types";
import { useNavigation } from "@react-navigation/native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CaretDownIcon } from "phosphor-react-native";
import { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, type TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import CommentCard from "#/components/comment/CommentCard";
import { EditCommentBox } from "#/components/EditCommentBox";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Image } from "#/components/heroui/image";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { CommentBox } from "#/components/index";
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
          orpc.news.one.queryKey({ input: { slug: newsSlug, type: "video" } }),
        ),
      initialDataUpdatedAt: () => {
        const qKey = orpc.news.one.queryKey({
          input: { slug: newsSlug, type: "video" },
        });

        return queryClient.getQueryState(qKey)?.dataUpdatedAt;
      },
    }),
  );

  const onEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const renderItem: ListRenderItem<Comment> = useCallback(
    ({ item }) => <CommentCard comment={item} />,
    [],
  );

  if (isError) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Text>Something went wrong</Text>
        </View>
      </Screen>
    );
  }

  if (isLoading) {
    return <ActivityIndicator className="text-p-300" />;
  }

  const allPages = data?.pages.flatMap((page) => page?.docs) ?? [];
  const { url, blurhash } = getImageData(news.data?.image);

  return (
    <Screen preset="fixed" safeAreaEdges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={50} style={{ flex: 1 }}>
        <FlashList
          contentContainerStyle={{ paddingBottom: 60, paddingTop: 0 }}
          data={allPages}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center">
              <Text>No comments yet</Text>
            </View>
          }
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator className="text-p-300" /> : null
          }
          ListHeaderComponent={
            <View className="mb-6 gap-5">
              <View className="flex-row items-center px-2">
                <Button onPress={() => navigation.goBack()} variant="ghost">
                  <Icon className="text-black" name={CaretDownIcon} size={24} />
                </Button>
                <Image
                  className="min-h-[60px] w-[60px] rounded-lg"
                  contentFit="cover"
                  placeholder={{ blurhash }}
                  source={url}
                />
                <View className="flex-1 px-2.5">
                  <Text className="text-sm" numberOfLines={3}>
                    {news.data?.title}
                  </Text>
                </View>
              </View>

              <Text className="pl-4 font-normal text-lg">
                Comments ({news.data?.totalComments ?? 0})
              </Text>
            </View>
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onRefresh={refetchByUser}
          refreshing={isRefetchingByUser}
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
