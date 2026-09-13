import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  type TextInput,
  View,
} from "react-native";
import {
  KeyboardChatScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CommentCard from "#/components/comment/CommentCard";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { CommentBox } from "#/components/index";
import CommentsMenuSheet from "#/components/sheets/CommentsMenuSheet";
import useGetComments, {
  type CommentSort,
} from "#/hooks/comments/useGetComments";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { CaretDownIcon, ChatIcon, DotsThreeVerticalIcon } from "#/lib/icons";
import { orpc } from "#/lib/orpc";

const HairlineSeparator = memo(() => <View className="h-px bg-[#ECECEE]" />);
HairlineSeparator.displayName = "HairlineSeparator";

/** Quiet empty state: one glyph, two lines, a text link. No card, no tips box. */
const CommentsEmptyState = memo(() => (
  <View className="items-center gap-2.5 px-10 pt-24">
    <Icon color="#DEDEE0" name={ChatIcon} size={34} />
    <Text className="font-bold text-[22px] text-foreground">
      Nothing here yet
    </Text>
    <Text className="text-center text-[#71717A] text-sm leading-[21px]">
      Be the first to share what you think about this story.
    </Text>
  </View>
));
CommentsEmptyState.displayName = "CommentsEmptyState";

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
        slug: newsSlug ?? "",
        type: "article",
      },
      initialData: () =>
        queryClient.getQueryData(
          orpc.news.one.queryKey({
            input: { slug: newsSlug ?? "", type: "article" },
          })
        ),
      initialDataUpdatedAt: () => {
        const qKey = orpc.news.one.queryKey({
          input: {
            slug: newsSlug ?? "",
            type: "article",
          },
        });

        return queryClient.getQueryState(qKey)?.dataUpdatedAt;
      },
    })
  );
  const insets = useSafeAreaInsets();
  const [sort, setSort] = useState<CommentSort>("recent");
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    data,
    fetchNextPage,
    isFetchingNextPage,
    hasNextPage,
    isPending: commentsPending,
    refetch,
  } = useGetComments(newsId ?? "", false, sort);

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  const navigation = useNavigation();

  // input ref
  const ref = useRef<TextInput>(null);
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

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<Comment>) => (
      <CommentCard comment={item} />
    ),
    []
  );

  const onEndReached = useCallback(() => {
    if (isFetchingNextPage || !hasNextPage) {
      return;
    }
    fetchNextPage();
  }, [isFetchingNextPage, fetchNextPage, hasNextPage]);

  const keyExtractor = useCallback((item) => item.id, []);

  /*
   * The composer sits between the list and the bottom of the screen, so the
   * list only needs to move by (keyboardHeight - composerHeight) — that
   * difference is what `offset` means here. Measured rather than guessed
   * because the composer grows with multiline input.
   */
  const [composerHeight, setComposerHeight] = useState(0);

  const renderScrollComponent = useCallback(
    (props: object) => (
      <KeyboardChatScrollView
        {...props}
        /*
         * "always", not "whenAtEnd": comments are sorted newest-first, so the
         * end of this list is the *oldest* comment. Lifting only at the end
         * would mean the content never moves for anyone reading the newest
         * comments, which is everyone.
         */
        keyboardLiftBehavior="always"
        offset={composerHeight}
      />
    ),
    [composerHeight]
  );

  // if ((news.isError || isError) && isConnected) {
  //   return (
  //     <YStack flex={1} justifyContent="center" ai="center">
  //       <Text>An error occurred</Text>
  //     </YStack>
  //   );
  // }

  if (news.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  const allPages = data?.pages.flatMap((page) => page.docs) || [];

  const total = news.data?.totalComments ?? allPages.length;

  return (
    <Screen
      contentContainerClassName="pt-safe"
      disableKeyboardAvoidingView
      statusBarStyle="auto"
    >
      <View style={{ flex: 1 }}>
        {/* Fixed chrome. In this layout the title block stays put and only
            the list scrolls, so the sort control is always reachable. */}
        <View className="flex-row items-center justify-between px-4 py-1.5">
          <Button
            hitSlop={14}
            onPress={() => navigation.goBack()}
            size="sm"
            variant="ghost"
          >
            <CaretDownIcon size={22} />
          </Button>
          <Button
            hitSlop={14}
            onPress={() => setMenuOpen(true)}
            size="sm"
            variant="ghost"
          >
            <DotsThreeVerticalIcon size={20} />
          </Button>
        </View>

        <View className="gap-1.5 px-5 pt-1.5 pb-4">
          <Text className="font-bold text-[30px] text-foreground leading-[34px]">
            Comments
          </Text>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3.5">
              <Pressable
                accessibilityLabel="Sort by newest"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setSort("recent")}
              >
                <Text
                  className={
                    sort === "recent"
                      ? "font-bold text-[13px] text-foreground"
                      : "text-[#A1A1AA] text-[13px]"
                  }
                >
                  Newest
                </Text>
              </Pressable>
              <View className="size-[3px] rounded-full bg-border" />
              <Pressable
                accessibilityLabel="Sort by top"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setSort("top")}
              >
                <Text
                  className={
                    sort === "top"
                      ? "font-bold text-[13px] text-foreground"
                      : "text-[#A1A1AA] text-[13px]"
                  }
                >
                  Top
                </Text>
              </Pressable>
            </View>
            <Text className="text-[#A1A1AA] text-xs">
              {total} {total === 1 ? "comment" : "comments"}
            </Text>
          </View>
        </View>

        {/* Article context as a rule and two lines rather than a card — the
            reader already knows what they tapped from. */}
        <Pressable
          className="flex-row gap-3 px-5 pb-4"
          onPress={() => navigation.goBack()}
        >
          <View className="w-0.5 rounded-full bg-s-300" />
          <View className="flex-1 gap-0.5">
            <Text className="font-bold text-[#71717A] text-[10px] tracking-wide">
              {typeof news.data?.category === "object"
                ? news.data?.category?.title?.toUpperCase()
                : null}
            </Text>
            <Text
              className="font-medium text-[#3F3F46] text-[13px] leading-[18px]"
              numberOfLines={2}
            >
              {news.data?.title}
            </Text>
          </View>
        </Pressable>

        <View className="h-px bg-[#ECECEE]" />

        <LegendList
          contentContainerStyle={{ paddingBottom: composerHeight }}
          data={allPages}
          ItemSeparatorComponent={HairlineSeparator}
          keyExtractor={keyExtractor}
          ListEmptyComponent={
            commentsPending || isFetchingNextPage ? null : (
              <CommentsEmptyState />
            )
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-4">
                <ActivityIndicator />
              </View>
            ) : null
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onRefresh={refetchByUser}
          recycleItems={false}
          refreshing={isRefetchingByUser}
          renderItem={renderItem}
          renderScrollComponent={renderScrollComponent}
          showsVerticalScrollIndicator={false}
          /*
           * Explicit, because the custom scroll component does not carry the
           * implicit flex sizing LegendList gets from a plain ScrollView —
           * without it the list measures 0 high and renders nothing at all.
           */
          style={{ flex: 1 }}
        />

        <View className="h-px bg-[#ECECEE]" />
        {/*
          The bottom safe-area inset lives on the composer, not on Screen.
          As Screen padding it was a transparent strip *below* the composer:
          the keyboard lifted the composer off it, leaving a gap above the
          keyboard and a window the list scrolled through. Owning it here
          keeps the strip opaque and part of the composer, and the `opened`
          offset drops it behind the keyboard so the input sits flush.
        */}
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View
            className="bg-surface"
            onLayout={(e) =>
              setComposerHeight(Math.ceil(e.nativeEvent.layout.height))
            }
            style={{ paddingBottom: insets.bottom }}
          >
            <CommentBox inputRef={ref} newsId={newsId} newsSlug={newsSlug} />
          </View>
        </KeyboardStickyView>
      </View>

      <CommentsMenuSheet onOpenChange={setMenuOpen} open={menuOpen} />
    </Screen>
  );
};

export default Comments;
