import { Galeria } from "@nandorojo/galeria";
import { isDefinedError } from "@orpc/client";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Separator } from "heroui-native";
import { SkeletonGroup } from "heroui-native/skeleton-group";
import { ArrowLeftIcon, UserIcon } from "phosphor-react-native";
import { useCallback, useEffect, useRef } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { toast } from "sonner-native";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Image } from "#/components/heroui/image";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { PayloadLexicalReactRenderer } from "#/components/lexical/payload-lexical-react-renderer";
import type { PayloadLexicalReactRendererContent } from "#/components/lexical/types";
import { NewsActionBar } from "#/components/News/NewsActionBar";
import { ReadingTrackerDebug } from "#/components/News/ReadinTrackerDebug";
import { userQueryOptions } from "#/hooks/auth/useUser";
import { useDislikeNews, useLikeNews, useNews } from "#/hooks/news";
import { useNewsAnalytics } from "#/hooks/news/useNewsAnalytics";
import { useReadingTracker } from "#/hooks/news/useNewsTracker";
import useAddActivity from "#/hooks/point/useAddActivity";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { authState } from "#/state/auth";
import { getImageData } from "#/utils/getImageData";

const SingleNews = () => {
  const navigation = useNavigation("News");
  const { slug } = useRoute("News").params;
  const { data, refetch, isError, error, isFetchedAfterMount, isFetching, isPlaceholderData } =
    useNews(slug as string);
  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);
  const likeMutation = useLikeNews();
  const dislikeMutation = useDislikeNews();
  const addActivityMutation = useAddActivity();
  const recordViewMutation = useMutation(orpc.news.recordView.mutationOptions());

  const { url, blurhash } = getImageData(data?.image);

  const getUserPoint = useQuery(
    orpc.activity.byNewsId.queryOptions({
      input: { newsId: data?.id ?? "", action: "read" },
      enabled: !!authState.user && !!data,
    }),
  );

  const {
    elapsedSeconds,
    minReadingSeconds,
    hasScrolledThreshold,
    inRapidScroll,
    isTracking,
    handleScroll,
    stopTracking,
  } = useReadingTracker(data, getUserPoint.data);

  const { trackView, trackRead, trackLike, trackDislike, trackShare, trackComment } =
    useNewsAnalytics(data ? { id: data.id, slug: data.slug } : undefined);

  // Track article view once per focus
  const hasTrackedView = useRef(false);
  const prevViewId = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!data) {
        return;
      }
      if (prevViewId.current !== data.id) {
        hasTrackedView.current = false;
        prevViewId.current = data.id;
      }
      if (hasTrackedView.current) {
        return;
      }
      hasTrackedView.current = true;
      trackView();
    }, [data, trackView]),
  );

  // Award points once reading conditions are met
  useEffect(() => {
    if (
      authState.user &&
      !authState.user.isAnonymous &&
      data &&
      !addActivityMutation.isPending &&
      !addActivityMutation.isSuccess &&
      !addActivityMutation.isError &&
      !getUserPoint.data?.length &&
      !inRapidScroll &&
      elapsedSeconds >= minReadingSeconds &&
      hasScrolledThreshold
    ) {
      stopTracking();
      // Track read event for analytics
      trackRead(elapsedSeconds, 0.85);
      addActivityMutation.mutate(
        {
          newsId: data.id,
          action: "read",
          type: "point",
          point: data?.points ?? 0,
          description: "Read a news article",
        },
        {
          onSuccess: (res) => {
            if (res?.message === "ALREADY_READ") {
              return;
            }
            toast.success("Points earned", {
              description: `You earned ${data.points} points for reading this article!`,
            });
            queryClient.invalidateQueries({
              queryKey: orpc.activity.byNewsId.queryKey({
                input: { newsId: data.id, action: "read" },
              }),
            });
            queryClient.invalidateQueries(userQueryOptions);
          },
        },
      );
    }
  }, [
    elapsedSeconds,
    minReadingSeconds,
    hasScrolledThreshold,
    inRapidScroll,
    data,
    authState.user,
    getUserPoint.data,
    addActivityMutation.isPending,
    addActivityMutation.isSuccess,
    addActivityMutation.isError,
    trackRead,
  ]);

  // Record a view once per article
  const hasRecordedView = useRef(false);
  const prevNewsId = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!data) {
        return;
      }
      if (prevNewsId.current !== data.id) {
        hasRecordedView.current = false;
        prevNewsId.current = data.id;
      }
      if (hasRecordedView.current) {
        return;
      }
      hasRecordedView.current = true;
      recordViewMutation.mutate({ newsId: data.id });
    }, [data]),
  );

  if (isFetchedAfterMount && isError && isDefinedError(error) && error.data?.code === "NOT_FOUND") {
    navigation.replace("NotFound");
    return null;
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-center">Failed to load news article</Text>
      </View>
    );
  }

  const handleLike = () => {
    if (!authState.user || authState.user.isAnonymous) {
      return navigation.navigate("SignIn", { redirect: "News" });
    }
    trackLike();
    likeMutation.mutate({
      newsId: data?.id ?? "",
      userId: authState.user.id,
      slug,
    });
  };

  const handleDislike = () => {
    if (!authState.user || authState.user.isAnonymous) {
      return navigation.navigate("SignIn", { redirect: "News" });
    }
    trackDislike();
    dislikeMutation.mutate({
      newsId: data?.id ?? "",
      userId: authState.user.id,
      slug,
    });
  };

  return (
    <Screen
      SystemBarsProps={{
        style: {
          navigationBar: "dark",
        },
      }}
    >
      <SkeletonGroup className="flex-1" isLoading={!data}>
        <ScrollView
          className="bg-white"
          contentContainerClassName="pb-4"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          refreshControl={
            <RefreshControl onRefresh={refetchByUser} refreshing={isRefetchingByUser} />
          }
          scrollEnabled={Boolean(data)}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-3">
            <Button
              className="absolute top-safe-offset-2 left-2.5 z-10 size-8 rounded-sm bg-[#C6C7C8]"
              onPress={() => navigation.goBack()}
            >
              <ArrowLeftIcon color="#00223d" size={20} />
            </Button>

            <SkeletonGroup.Item className="h-[30vh] w-full">
              <Galeria urls={[url]}>
                <Galeria.Image>
                  <Image
                    className="h-[30vh] w-full"
                    contentFit="cover"
                    placeholder={{ blurhash }}
                    placeholderContentFit="cover"
                    source={url}
                  />
                </Galeria.Image>
              </Galeria>
            </SkeletonGroup.Item>
          </View>

          <View className="gap-5 px-3">
            <SkeletonGroup.Item className="h-12.5 w-full">
              <Text className="font-bold text-[20px] leading-6.25">{data?.title}</Text>
            </SkeletonGroup.Item>

            <View className="flex-row items-center justify-between">
              <SkeletonGroup.Item className="h-4.25 w-25">
                <View className="flex-row items-center gap-0.75">
                  <Icon name={UserIcon} size={15} />
                  <Text className="font-bold">
                    {typeof data?.author === "object" ? data?.author.fullName : ""}
                  </Text>
                </View>
              </SkeletonGroup.Item>

              <SkeletonGroup.Item className="h-4.25 w-32.5">
                {data ? (
                  <Text className="text-[#737373] text-xs">
                    {format(new Date(data?.createdAt ?? new Date()), "do MMMM yyy | p")}
                  </Text>
                ) : null}
              </SkeletonGroup.Item>
            </View>

            <SkeletonGroup.Item className="h-[60vh] w-full">
              <View className="mt-1">
                <Separator className="" />
                <Text className="mb-3 font-bold text-base">KEY POINTS</Text>
                {data?.keyPoints?.map(({ point }, i: number) => (
                  <View className="flex-row gap-2 pb-2" key={i}>
                    <Text className="text-xs">{"\u2B24"}</Text>
                    <Text className="p-0" selectable>
                      {point}
                    </Text>
                  </View>
                ))}
                <Separator className="" />
              </View>
            </SkeletonGroup.Item>

            {isFetching && isPlaceholderData ? (
              <View className="h-[60vh] w-full rounded-lg bg-neutral-200" />
            ) : (
              <PayloadLexicalReactRenderer
                content={data?.content as PayloadLexicalReactRendererContent}
              />
            )}
          </View>
        </ScrollView>

        <NewsActionBar
          news={data}
          onComment={trackComment}
          onDislike={handleDislike}
          onLike={handleLike}
          onShare={trackShare}
        />
      </SkeletonGroup>

      <ReadingTrackerDebug
        elapsedSeconds={elapsedSeconds}
        hasScrolledThreshold={hasScrolledThreshold}
        inRapidScroll={inRapidScroll}
        isTracking={isTracking}
        minReadingSeconds={minReadingSeconds}
        wordCount={data?.wordCount ?? 0}
      />
    </Screen>
  );
};

export default SingleNews;
