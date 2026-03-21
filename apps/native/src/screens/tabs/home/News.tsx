import { Skeleton } from "@alloc/moti/skeleton";
import { isDefinedError } from "@orpc/client";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { ArrowLeft, User } from "@tamagui/lucide-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCallback, useEffect, useRef } from "react";
import { RefreshControl } from "react-native";
import { toast } from "sonner-native";
import {
  Heading,
  Paragraph,
  ScrollView,
  Separator,
  Stack,
  Text,
  useWindowDimensions,
  XStack,
  YStack,
} from "tamagui";

import { PayloadLexicalReactRenderer } from "#/components/lexical/PayloadLexicalReactRenderer";
import type { PayloadLexicalReactRendererContent } from "#/components/lexical/types";
import { NewsActionBar } from "#/components/News/NewsActionBar";
import { ReadingTrackerDebug } from "#/components/News/ReadinTrackerDebug";
import { Screen } from "#/components/Screen";
import { Image } from "#/components/ui";
import { Button } from "#/components/ui/Button";
import { userQueryOptions } from "#/hooks/auth/useUser";
import { useDislikeNews, useLikeNews, useNews } from "#/hooks/news";
import { useReadingTracker } from "#/hooks/news/useNewsTracker";
import useAddActivity from "#/hooks/point/useAddActivity";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { authState } from "#/state/auth";
import { getImageData } from "#/utils/getImageData";

const SingleNews = () => {
  const navigation = useNavigation("News");
  const { id, slug } = useRoute("News").params;
  const { data, refetch, isError, error, isFetchedAfterMount } = useNews(
    slug as string
  );
  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);
  const { height } = useWindowDimensions();
  const likeMutation = useLikeNews();
  const dislikeMutation = useDislikeNews();
  const addActivityMutation = useAddActivity();
  const recordViewMutation = useMutation(
    orpc.news.recordView.mutationOptions()
  );

  const { url, blurhash } = getImageData(data?.image);

  const getUserPoint = useQuery(
    orpc.activity.byNewsId.queryOptions({
      input: { newsId: data?.id ?? "", action: "read" },
      enabled: !!authState.user && !!data,
    })
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

  console.log(
    !inRapidScroll,
    elapsedSeconds >= minReadingSeconds,
    hasScrolledThreshold
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
        }
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
  ]);

  // Record a view once per article
  const hasRecordedView = useRef(false);
  const prevNewsId = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!data) return;
      if (prevNewsId.current !== data.id) {
        hasRecordedView.current = false;
        prevNewsId.current = data.id;
      }
      if (hasRecordedView.current) return;
      hasRecordedView.current = true;
      recordViewMutation.mutate({ newsId: data.id });
    }, [data])
  );

  if (
    isFetchedAfterMount &&
    isError &&
    isDefinedError(error) &&
    error.data?.code === "NOT_FOUND"
  ) {
    navigation.replace("NotFound");
    return null;
  }

  if (isError) {
    return (
      <YStack ai="center" flex={1} jc="center">
        <Text>Failed to load news article</Text>
      </YStack>
    );
  }

  const handleLike = () => {
    if (!authState.user || authState.user.isAnonymous) {
      return navigation.navigate("SignIn", { redirect: "News" });
    }
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
    dislikeMutation.mutate({
      newsId: data?.id ?? "",
      userId: authState.user.id,
      slug,
    });
  };

  return (
    <Screen safeAreaEdges={["top"]}>
      <Skeleton.Group show={!data}>
        <ScrollView
          bg="$background"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          refreshControl={
            <RefreshControl
              onRefresh={refetchByUser}
              refreshing={isRefetchingByUser}
            />
          }
          scrollEnabled={Boolean(data)}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <Stack mb="$3">
            <Button
              bg="#C6C7C8"
              borderRadius={4}
              h={32}
              left={10}
              onPress={() => navigation.goBack()}
              pos="absolute"
              pressStyle={{ bg: "$p50" }}
              top={10}
              w={32}
              zIndex="$2"
            >
              <Button.Icon color="$p500">
                <ArrowLeft />
              </Button.Icon>
            </Button>

            <Skeleton
              colorMode="light"
              disableExitAnimation
              height={height * 0.3}
              width="100%"
            >
              {data ? (
                <Image
                  borderBottomLeftRadius={8}
                  borderBottomRightRadius={8}
                  contentFit="cover"
                  h={height * 0.3}
                  placeholder={{ blurhash }}
                  placeholderContentFit="cover"
                  source={url}
                />
              ) : null}
            </Skeleton>
          </Stack>

          <Stack gap="$5" px="$3">
            <Skeleton
              colorMode="light"
              disableExitAnimation
              height={50}
              width="100%"
            >
              <Heading fontSize={20} lh={25}>
                {data?.title}
              </Heading>
            </Skeleton>

            <XStack ai="center" jc="space-between">
              <Skeleton
                colorMode="light"
                disableExitAnimation
                height={17}
                width={100}
              >
                <XStack ai="center" gap="$0.75">
                  <User size={15} />
                  <Text fontWeight="700">
                    {typeof data?.author === "object"
                      ? data?.author.fullName
                      : ""}
                  </Text>
                </XStack>
              </Skeleton>

              <Skeleton
                colorMode="light"
                disableExitAnimation
                height={17}
                width={110}
              >
                {data ? (
                  <Text color="#737373" fos={12}>
                    {format(
                      new Date(data?.createdAt ?? new Date()),
                      "do MMMM yyy | p"
                    )}
                  </Text>
                ) : null}
              </Skeleton>
            </XStack>

            <Skeleton
              colorMode="light"
              disableExitAnimation
              show={!data?.content}
            >
              <Stack mt="$1">
                <Separator h={2} mb={2} />
                <Heading fos="$5" mb={3}>
                  KEY POINTS
                </Heading>
                {data?.keyPoints?.map(({ point }, i: number) => (
                  <XStack gap="$2" key={i} pb="$2">
                    <Paragraph fos="$2">{"\u2B24"}</Paragraph>
                    <Paragraph p={0}>{point}</Paragraph>
                  </XStack>
                ))}
                <Separator h={2} pb={2} />
              </Stack>
            </Skeleton>

            <Skeleton
              colorMode="light"
              disableExitAnimation
              height={height * 0.6}
              show={!data?.content}
              width="100%"
            >
              <PayloadLexicalReactRenderer
                content={data?.content as PayloadLexicalReactRendererContent}
              />
            </Skeleton>
          </Stack>
        </ScrollView>
      </Skeleton.Group>

      <NewsActionBar
        news={data}
        onDislike={handleDislike}
        onLike={handleLike}
      />

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
