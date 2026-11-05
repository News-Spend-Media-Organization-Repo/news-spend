import { Galeria } from "@nandorojo/galeria";
import { isDefinedError } from "@orpc/client";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Sentry from "@sentry/react-native";
import { format } from "date-fns/format";
import { Separator } from "heroui-native/separator";
import { SkeletonGroup } from "heroui-native/skeleton-group";
import { useEffect } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { PayloadLexicalReactRenderer } from "#/components/lexical/payload-lexical-react-renderer";
import type { PayloadLexicalReactRendererContent } from "#/components/lexical/types";
import { NewsActionBar } from "#/components/News/NewsActionBar";
import { ReadingTrackerDebug } from "#/components/News/ReadinTrackerDebug";
import { SizedImage } from "#/components/SizedImage";
import usePrefetchComments from "#/hooks/comments/usePrefetchComments";
import { useNews } from "#/hooks/news";
import { useMarkInteractive } from "#/hooks/useMarkInteractive";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { ArrowLeftIcon, UserIcon } from "#/lib/icons";
import { useSafeBack } from "#/navigation/useSafeBack";
import { getImageData } from "#/utils/getImageData";
import { toInstant } from "#/utils/toInstant";
import { ArticleUnavailable } from "./ArticleUnavailable";
import { useArticleActions } from "./hooks/use-article-actions";
import { useArticleTracking } from "./hooks/use-article-tracking";

const SingleNews = () => {
  const navigation = useNavigation("News");
  const { slug } = useRoute("News").params;

  const {
    data,
    refetch,
    isError,
    error,
    isFetchedAfterMount,
    isFetching,
    isPlaceholderData,
  } = useNews(slug as string);
  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  const {
    handleScroll,
    elapsedSeconds,
    minReadingSeconds,
    hasScrolledThreshold,
    inRapidScroll,
    isTracking,
    trackLike,
    trackDislike,
    trackShare,
    trackComment,
  } = useArticleTracking(data);

  // Tapping a reaction you already hold removes it, so only the tap that adds
  // one is an event. The callbacks run after the sign-in check, so a signed-out
  // reader who is sent to the sign-in screen is not counted either.
  const { handleLike, handleDislike } = useArticleActions(
    data,
    () => {
      if (data?.userReaction !== "like") {
        trackLike();
      }
    },
    () => {
      if (data?.userReaction !== "dislike") {
        trackDislike();
      }
    }
  );

  // Emits nav_tti for /Tab/Home/News once the article content has rendered.
  useMarkInteractive(Boolean(data));

  // Warm the comments cache so the comments screen opens instantly.
  usePrefetchComments(data?.id);

  // The API said this article does not exist. That is a different state from a
  // failed load, so it gets its own screen rather than the global NotFound,
  // which is reserved for links that match no route.
  const isUnavailable =
    isError && isDefinedError(error) && error.code === "NOT_FOUND";

  useEffect(() => {
    if (isUnavailable) {
      Sentry.captureMessage("Article unavailable", {
        level: "info",
        tags: { area: "article-deeplink" },
        extra: { slug },
        fingerprint: ["article-unavailable"],
      });
    }
  }, [isUnavailable, slug]);

  // A reset, not a navigate: navigating to "Tab" would push a second one and
  // leave this screen underneath, so back from Home would land here again. On a
  // cold start from a link there is no Tab on the stack at all.
  const goHome = () =>
    navigation.reset({
      index: 0,
      routes: [{ name: "Tab", params: { screen: "Home" } }],
    });

  const goBack = useSafeBack();

  if (isUnavailable) {
    return <ArticleUnavailable onBack={goBack} onGoToLatest={goHome} />;
  }

  if (isFetchedAfterMount && isError) {
    return (
      <Screen
        className="flex-1 items-center justify-center"
        navigationBarButtonStyle="dark"
        statusBarStyle="auto"
      >
        <Button
          className="absolute top-safe-offset-2 left-2.5 z-20 size-8 rounded-full bg-white/80"
          onPress={goBack}
          variant="ghost"
        >
          <ArrowLeftIcon color="#00223d" size={20} />
        </Button>
        <Text className="text-center">Failed to load news article</Text>
      </Screen>
    );
  }

  const { url, fallbackUrl, blurhash, focal } = getImageData(
    data?.image,
    "mobile"
  );
  return (
    <Screen navigationBarButtonStyle="dark" statusBarStyle="auto">
      <Button
        className="absolute top-safe-offset-2 left-2.5 z-20 size-8 rounded-full bg-white/80"
        onPress={goBack}
        variant="ghost"
      >
        <ArrowLeftIcon color="#00223d" size={20} />
      </Button>
      <SkeletonGroup className="flex-1" isLoading={!data}>
        <ScrollView
          className="bg-white"
          contentContainerClassName="pb-4"
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
          <View className="mb-3">
            <SkeletonGroup.Item
              className="w-full rounded-md"
              style={{ aspectRatio: HERO_ASPECT_RATIO }}
            >
              <Galeria urls={[url]}>
                <Galeria.Image>
                  <SizedImage
                    className="w-full"
                    contentFit="cover"
                    contentPosition={{
                      left: `${focal?.x ?? 50}%`,
                      top: `${focal?.y ?? 50}%`,
                    }}
                    fallbackSource={fallbackUrl}
                    placeholder={{ blurhash }}
                    placeholderContentFit="cover"
                    source={url}
                    style={{ aspectRatio: HERO_ASPECT_RATIO }}
                  />
                </Galeria.Image>
              </Galeria>
            </SkeletonGroup.Item>
          </View>

          <View className="gap-5 px-3">
            <SkeletonGroup.Item className="h-12.5 w-full rounded-md">
              <Text className="font-bold text-[20px] leading-6.25">
                {data?.title}
              </Text>
            </SkeletonGroup.Item>

            <View className="flex-row items-center justify-between">
              <SkeletonGroup.Item className="h-4.25 w-25 rounded-md">
                <View className="flex-row items-center gap-0.75">
                  <Icon name={UserIcon} size={15} />
                  <Text className="font-bold">
                    {typeof data?.author === "object" && data.author
                      ? data.author.fullName
                      : ""}
                  </Text>
                </View>
              </SkeletonGroup.Item>

              <SkeletonGroup.Item className="h-4.25 w-32.5 rounded-md">
                {data?.createdAt ? (
                  <Text className="text-[#737373] text-xs">
                    {format(toInstant(data.createdAt), "do MMMM yyy | p")}
                  </Text>
                ) : null}
              </SkeletonGroup.Item>
            </View>

            <SkeletonGroup.Item
              className="h-[60vh] w-full rounded-md"
              isLoading={!data?.keyPoints}
            >
              <View className="mt-1">
                <Separator />
                <Text className="mb-3 font-bold text-base">KEY POINTS</Text>
                {data?.keyPoints?.map(({ point }, i) => (
                  <View className="flex-row gap-2 pb-2" key={i}>
                    <Text className="text-xs">{"\u2B24"}</Text>
                    <Text className="flex-1 p-0" selectable>
                      {point}
                    </Text>
                  </View>
                ))}
                <Separator />
              </View>
            </SkeletonGroup.Item>

            {isFetching && isPlaceholderData ? (
              <View className="h-[60vh] w-full rounded-lg bg-neutral-200" />
            ) : (
              <SkeletonGroup.Item
                className="h-[60vh] w-full rounded-md"
                isLoading={!data?.content}
              >
                <PayloadLexicalReactRenderer
                  content={data?.content as PayloadLexicalReactRendererContent}
                />
              </SkeletonGroup.Item>
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

/**
 * A fixed 4:3 hero, cropped around the focal point editors set in the CMS.
 * Other news apps do the same: the headline stays on the first screen whatever
 * shape the photo is, and tapping the image opens it whole.
 */
const HERO_ASPECT_RATIO = 4 / 3;

export default SingleNews;
