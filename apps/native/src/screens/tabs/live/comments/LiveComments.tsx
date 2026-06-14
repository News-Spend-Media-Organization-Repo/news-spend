import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import type { Comment } from "@news-spend-media/payload";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CaretDownIcon } from "phosphor-react-native";
import { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, type TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { CommentBox } from "#/components/CommentBox";
import CommentCard from "#/components/comment/CommentCard";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
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
    ({ item }: LegendListRenderItemProps<Comment, string | undefined>) => (
      <CommentCard comment={item} />
    ),
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

  return (
    <Screen className="bg-white" disableKeyboardAvoidingView preset="fixed" safeAreaEdges={[]}>
      <LegendList
        contentContainerClassName="pt-safe"
        contentContainerStyle={{ paddingBottom: 60 }}
        data={allPages}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-12">
            <Text className="text-secondary">No comments yet. Be the first!</Text>
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
                <Text className="text-base" numberOfLines={3} variant="subtitle">
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

      {/* Single composer — handles idle, reply, and edit modes internally */}
      <KeyboardStickyView offset={{ closed: 0, opened: 20 }}>
        <View className="pb-safe">
          <CommentBox inputRef={inputRef} newsId={newsId} newsSlug={newsSlug} />
        </View>
      </KeyboardStickyView>
    </Screen>
  );
};

export default LiveComments;
