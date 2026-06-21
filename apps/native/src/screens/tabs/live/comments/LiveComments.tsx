import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import type { Comment } from "@news-spend-media/payload";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CaretDownIcon } from "phosphor-react-native";
import { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, type TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { CommentBox } from "#/components/CommentBox";
import CommentCard from "#/components/comment/CommentCard";
import { Button } from "#/components/heroui/button";
import { Image } from "#/components/heroui/image";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import useGetComments from "#/hooks/comments/useGetComments";
import { useFocusBackHandler } from "#/hooks/useBackHandler";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";
import { getImageData } from "#/utils/getImageData";

const LiveComments = ({ route }) => {
  const queryClient = useQueryClient();
  const { newsId, newsSlug } = route.params;
  const navigation = useNavigation();

  const { data, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage, isPending } =
    useGetComments(newsId, false);

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);
  const inputRef = useRef<TextInput>(null);

  // Auto-focus the input when the route param requests it.
  useEffect(() => {
    if (route.params?.focus && inputRef.current) {
      const id = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(id);
    }
  }, [route?.params?.focus]);

  // Pressing back while the input is focused dismisses it first.
  useFocusBackHandler(() => {
    if (inputRef.current?.isFocused()) {
      inputRef.current.blur();
      return true;
    }
    return false;
  });

  const news = useQuery(
    orpc.news.one.queryOptions({
      input: { slug: newsSlug, type: "video" },
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

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<typeof headerItem | Comment>) => {
      if ("__type" in item && item.__type === "postHeader") {
        return (
          <View className="mb-6 gap-5 bg-white">
            <View className="flex-row items-center px-2">
              <Button hitSlop={14} onPress={() => navigation.goBack()} size="sm" variant="ghost">
                <CaretDownIcon size={20} />
              </Button>
              <Image
                className="h-full w-15 rounded-[10px]"
                contentFit="cover"
                placeholder={{ blurhash: item.blurhash }}
                source={item.url}
              />
              <View className="flex-1 px-2.5">
                <Text className="text-base" numberOfLines={3} variant="subtitle">
                  {item.title}
                </Text>
              </View>
            </View>
            <Text className="pl-4 font-normal text-lg">Comments ({item.totalComments})</Text>
          </View>
        );
      }
      return <CommentCard comment={item} screenType="live" />;
    },
    [navigation],
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

  if (isPending) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator className="text-p-300" />
        </View>
      </Screen>
    );
  }

  const allPages = data?.pages.flatMap((page) => page?.docs ?? []) ?? [];
  const { url, blurhash } = getImageData(news.data?.image);

  const headerItem = {
    __type: "postHeader" as const,
    id: "post-header",
    title: news.data?.title,
    totalComments: news.data?.totalComments ?? 0,
    url,
    blurhash,
  };

  const listData = [headerItem, ...allPages];

  return (
    <Screen contentContainerClassName="py-safe" disableKeyboardAvoidingView preset="fixed">
      <LegendList
        contentContainerStyle={{ paddingBottom: 60 }}
        data={listData}
        getItemType={(item) => ("__type" in item ? "postHeader" : "row")}
        keyExtractor={(item) => ("__type" in item ? item.id : item.id)}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-12">
            <Text className="text-secondary">No comments yet. Be the first!</Text>
          </View>
        }
        ListFooterComponent={
          isFetchingNextPage ? <ActivityIndicator className="text-p-300" /> : null
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onRefresh={refetchByUser}
        refreshing={isRefetchingByUser}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        stickyHeaderHiddenOnScroll
        stickyHeaderIndices={[0]}
      />
      <KeyboardAvoidingView
        // automaticOffset
        behavior={"padding"}
        // className="flex-1"
        // keyboardVerticalOffset={100}
      >
        <CommentBox inputRef={inputRef} newsId={newsId} newsSlug={newsSlug} />
      </KeyboardAvoidingView>
    </Screen>
  );
};

export default LiveComments;
