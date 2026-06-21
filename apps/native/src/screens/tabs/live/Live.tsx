import { LegendList } from "@legendapp/list/react-native";
import type { Admin } from "@news-spend-media/payload/types";
import { isDefinedError } from "@orpc/client";
import { useNavigation, usePreventRemove, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Alert } from "heroui-native/alert";
import { SkeletonGroup } from "heroui-native/skeleton-group";
import { UserIcon } from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, useWindowDimensions, View } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import { toast } from "sonner-native";
import { useSnapshot } from "valtio";
import CommentCard from "#/components/comment/CommentCard";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { NewsActionBar } from "#/components/News/NewsActionBar";
import useGetComments from "#/hooks/comments/useGetComments";
import { useDislikeNews, useLikeNews, useNews } from "#/hooks/news";
import useAddActivity from "#/hooks/point/useAddActivity";
import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { authState } from "#/state/auth";

type YTState = "unstarted" | "video cue" | "buffering" | "playing" | "paused" | "ended";

const POINTS_THRESHOLD = 20 * 60; // 20 minutes in seconds

function Live() {
  const navigation = useNavigation("SingleLive");
  const route = useRoute("SingleLive");
  const { width } = useWindowDimensions();

  const [ytState, setYtState] = useState<YTState>("unstarted");
  const [watchTime, setWatchTime] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const { slug, id } = route.params;

  const likeMutation = useLikeNews();
  const dislikeMutation = useDislikeNews();
  const { data, isPending, error, isError, isLoading, isFetchedAfterMount } = useNews(
    slug,
    "video",
  );
  const commentQuery = useGetComments(id ?? data?.id, false);
  const auth = useSnapshot(authState);

  const addActivityMutation = useAddActivity();

  const getUserPoint = useQuery(
    orpc.activity.byNewsId.queryOptions({
      input: {
        newsId: data?.id as string,
        action: "watchLive",
      },
      enabled: !!authState.user && !!data,
    }),
  );

  const hasEarnedPoints = Boolean(getUserPoint.data && getUserPoint.data.length > 0);

  // Stable callback wrapper to prevent stale state closures
  const awardPoints = useCallback(() => {
    if (!data?.id || hasEarnedPoints) {
      return;
    }

    addActivityMutation.mutate(
      {
        newsId: data.id,
        action: "watchLive",
        type: "point",
        point: data.points ?? 0,
        description: "Watched live news",
      },
      {
        onSuccess: () => {
          toast.success("Points earned", {
            description: `You earned ${data.points} points for watching!`,
          });
          clearInterval(intervalRef.current);
          queryClient.invalidateQueries({
            queryKey: orpc.activity.byNewsId.queryKey({
              input: { newsId: data.id, action: "watchLive" },
            }),
          });
        },
      },
    );
  }, [data, hasEarnedPoints, addActivityMutation]);

  // Watch time ticker effect
  useEffect(() => {
    const shouldTrack = ytState === "playing" && data?.isLive && !hasEarnedPoints;

    if (shouldTrack) {
      intervalRef.current = setInterval(() => {
        setWatchTime((prevTime) => {
          const nextTime = prevTime + 1;
          if (nextTime >= POINTS_THRESHOLD) {
            awardPoints();
            return 0;
          }
          return nextTime;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [ytState, data?.isLive, hasEarnedPoints, awardPoints]);

  // Handle navigation blocking if the user attempts to leave early
  const shouldBlockRouteRemoval =
    !hasEarnedPoints && ytState === "playing" && Boolean(data?.isLive);

  usePreventRemove(shouldBlockRouteRemoval, ({ data: actionData }) => {
    // Pause playback while prompt alert is open
    setYtState("paused");

    Alert.alert(
      "Leave without earning points?",
      "You haven't earned points for watching the live stream. Are you sure you want to leave?",
      [
        {
          text: "Stay",
          style: "cancel",
          onPress: () => {
            // Resume playback if they stay
            setYtState("playing");
          },
        },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => navigation.dispatch(actionData.action),
        },
      ],
    );
  });

  const onStateChange = useCallback((state: YTState) => {
    setYtState(state);
  }, []);

  const handleLike = () => {
    if (!authState.user || authState.user.isAnonymous) {
      return navigation.navigate("SignIn", { redirect: route.name });
    }
    likeMutation.mutate({ newsId: id, userId: authState.user.id, slug });
  };

  const handleDislike = () => {
    if (!authState.user || authState.user.isAnonymous) {
      return navigation.navigate("SignIn", { redirect: route.name });
    }
    dislikeMutation.mutate({ newsId: id, userId: authState.user.id, slug });
  };

  const onShare = () => {
    if (!(authState.user && data?.id)) {
      return;
    }

    addActivityMutation.mutate(
      {
        newsId: data.id,
        action: "share",
        type: "point",
        point: 5,
        description: "Shared live news",
      },
      {
        onSuccess: () => {
          toast.success("Points earned", {
            description: "You earned 5 points for sharing!",
          });
          queryClient.invalidateQueries({
            queryKey: orpc.activity.byNewsId.queryKey({
              input: { newsId: data.id, action: "share" },
            }),
          });
        },
      },
    );
  };

  const commentWithHeader = useMemo(() => {
    if (!commentQuery.data?.pages?.[0]?.docs) {
      return [];
    }
    return ["HEADER", ...commentQuery.data.pages[0].docs.slice(0, 3)];
  }, [commentQuery.data]);

  if (isFetchedAfterMount && isError && isDefinedError(error) && error.data?.code === "NOT_FOUND") {
    navigation.replace("NotFound");
    return null;
  }

  if (isFetchedAfterMount && (isError || !data)) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text>Failed to load news article</Text>
      </View>
    );
  }

  return (
    <Screen contentContainerClassName="pt-safe" systemBarStyle="dark">
      {data?.isLive && !auth.user && (
        <Alert className="items-center rounded-lg" status="warning">
          <Alert.Indicator className="pt-0" />
          <Alert.Content>
            <Alert.Title>Sign in to earn points for joining Live stream</Alert.Title>
          </Alert.Content>
          <Button onPress={() => navigation.navigate("SignIn")} size="sm" variant="primary">
            Login
          </Button>
        </Alert>
      )}

      <SkeletonGroup className="flex-1" isLoading={isPending || isLoading}>
        <SkeletonGroup.Item className="aspect-video rounded-none">
          <YoutubePlayer
            height={(width / 16) * 9}
            onChangeState={onStateChange}
            play={ytState === "playing"}
            videoId={data?.url?.split("/").at(-1)}
          />
        </SkeletonGroup.Item>

        <View className="gap-7 px-3 py-3">
          <SkeletonGroup.Item>
            <Text className="text-xl leading-6.25" variant="title">
              {data?.title}
            </Text>
          </SkeletonGroup.Item>

          <View className="flex-row items-center justify-between">
            <SkeletonGroup.Item>
              <View className="flex-row items-center gap-0.75">
                <Icon name={UserIcon} size={15} />
                <Text className="font-bold">{(data?.author as Admin)?.fullName ?? "N/A"}</Text>
              </View>
            </SkeletonGroup.Item>

            <SkeletonGroup.Item>
              <Text className="text-[#737373] text-xs">
                {data?.createdAt && format(new Date(data.createdAt), "do MMMM yyy | p")}
              </Text>
            </SkeletonGroup.Item>
          </View>
        </View>

        <View className="flex-1 gap-4 px-2">
          {!commentQuery.data || commentQuery.data?.pages[0]?.totalDocs < 1 ? (
            <View className="flex-1">
              <Text className="bg-white py-2 pl-2 font-normal text-lg">Comments</Text>
              <View className="flex-1 items-center justify-center">
                <Text className="text-center text-[15px]">Be the first to comment</Text>
                <Button
                  onPress={() =>
                    navigation.navigate("LiveComment", {
                      newsId: data?.id as string,
                      newsSlug: data?.slug as string,
                    })
                  }
                >
                  <Button.Label>Comment</Button.Label>
                </Button>
              </View>
            </View>
          ) : (
            <LegendList
              contentContainerStyle={{ paddingBottom: 60 }}
              data={commentWithHeader}
              keyExtractor={(item, index) =>
                typeof item === "string" ? item : (item.id ?? index.toString())
              }
              ListEmptyComponent={commentQuery.isPending ? <ActivityIndicator /> : null}
              ListFooterComponent={
                commentQuery.data?.pages[0]?.totalDocs > 3 ? (
                  <Button
                    onPress={() =>
                      navigation.navigate("LiveComment", {
                        newsId: data?.id as string,
                        newsSlug: data?.slug as string,
                      })
                    }
                  >
                    <Button.Label>See all comments</Button.Label>
                  </Button>
                ) : null
              }
              renderItem={({ item }) =>
                typeof item === "string" ? (
                  <View className="bg-white py-2 pl-2">
                    <Text className="font-normal text-lg">Comments</Text>
                  </View>
                ) : (
                  <CommentCard comment={item} screenType="live" />
                )
              }
              stickyHeaderHiddenOnScroll
              stickyHeaderIndices={[0]}
            />
          )}
        </View>
        {data && (
          <NewsActionBar
            news={data}
            onDislike={handleDislike}
            onLike={handleLike}
            onShare={onShare}
          />
        )}
      </SkeletonGroup>
    </Screen>
  );
}

export default Live;
