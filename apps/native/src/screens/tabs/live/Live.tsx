import { Skeleton } from "@alloc/moti/skeleton";
import type { Admin } from "@news-spend-media/payload/types";
import { isDefinedError } from "@orpc/client";
import {
  Link,
  useNavigation,
  usePreventRemove,
  useRoute,
} from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import { toast } from "sonner-native";
import {
  H5,
  Heading,
  Paragraph,
  Spinner,
  Stack,
  Text,
  useWindowDimensions,
  View,
  XStack,
  YStack,
} from "tamagui";
import { InfoFill, User } from "tamagui-phosphor";
import { useSnapshot } from "valtio";

import CommentCard from "#/components/comment/CommentCard";
import { NewsActionBar } from "#/components/News/NewsActionBar";
import { Screen } from "#/components/Screen";
import { Button } from "#/components/ui";
import useGetComments from "#/hooks/comments/useGetComments";
import { useDislikeNews, useLikeNews, useNews } from "#/hooks/news";
import useAddActivity from "#/hooks/point/useAddActivity";
import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { authState } from "#/state/auth";

type YTState =
  | "unstarted"
  | "video cue"
  | "buffering"
  | "playing"
  | "paused"
  | "ended";

const POINTS_THRESHOLD = 20 * 60; // 20 minutes in seconds
function Live() {
  const navigation = useNavigation("SingleLive");
  const route = useRoute("SingleLive");
  const { width } = useWindowDimensions();
  const [ytState, setYtState] = useState<YTState>("unstarted");
  const [, setWatchTime] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const { slug, id } = route.params;

  const likeMutation = useLikeNews();
  const dislikeMutation = useDislikeNews();
  const { data, isPending, error, isError, isLoading, isFetchedAfterMount } =
    useNews(slug, "video");
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
    })
  );

  const awardPoints = () => {
    if (!getUserPoint.data?.length) {
      addActivityMutation.mutate(
        {
          newsId: data?.id as string,
          action: "watchLive",
          type: "point",
          point: data?.points as number,
          description: "Watched live news",
        },
        {
          onSuccess: (response) => {
            toast.success("Points earned", {
              description: `You earned ${data?.points} points for watching!`,
            });

            clearInterval(intervalRef.current);
            queryClient.invalidateQueries({
              queryKey: orpc.activity.byNewsId.queryKey({
                input: {
                  newsId: data?.id as string,
                  action: "watchLive",
                },
              }),
            });
          },
        }
      );
    }
  };

  useEffect(() => {
    if (ytState === "playing" && data?.isLive && !getUserPoint.data?.length) {
      // Start tracking watch time
      intervalRef.current = setInterval(() => {
        setWatchTime((prevTime) => {
          const newTime = prevTime + 1;
          if (newTime === POINTS_THRESHOLD) {
            awardPoints();
          }
          return newTime;
        });
      }, 1000);
    } else if (ytState === "ended") {
      clearInterval(intervalRef.current);
    } else {
    }

    return () => clearInterval(intervalRef.current);
  }, [ytState, getUserPoint.data, data?.isLive]);

  usePreventRemove(
    Boolean(getUserPoint.data?.length) &&
      ytState !== "unstarted" &&
      Boolean(data?.isLive),
    ({ data }) => {
      // const isPlaying = ytState;
      setYtState((prev) => (prev === "playing" ? "paused" : prev));

      Alert.alert(
        "Leave without earning points?",
        "You haven't earned points for watching the live stream. Are you sure you want to leave?",
        [
          {
            text: "Stay",
            style: "cancel",
            onPress: () => {
              // TODO: work this out
              // setYtState(() => {
              //   return isPlaying === "paused" ? "paused" : "playing";
              // });
            },
          },
          {
            text: "Leave",
            style: "destructive",
            onPress: () => navigation.dispatch(data.action),
          },
        ]
      );
    }
  );

  const onStateChange = useCallback((state) => {
    setYtState(() => state);
  }, []);

  const handleLike = () => {
    if (!authState.user || authState.user.isAnonymous) {
      return navigation.navigate("SignIn", { redirect: route.name });
    }

    likeMutation.mutate({
      newsId: id,
      userId: authState.user.id,
      slug,
    });
  };

  const handleDislike = () => {
    if (!authState.user || authState.user.isAnonymous) {
      return navigation.navigate("SignIn", { redirect: route.name });
    }

    dislikeMutation.mutate({
      newsId: id,
      userId: authState.user.id,
      slug,
    });
  };

  // award point for sharing
  const onShare = () => {
    if (!authState.user) {
      return;
    }
    addActivityMutation.mutate(
      {
        newsId: data?.id as string,
        action: "share",
        type: "point",
        point: 5, // TODO: make this dynamic
        description: "Shared live news",
      },
      {
        onSuccess: (response) => {
          toast.success("Points earned", {
            description: `You earned ${data?.points} points for sharing!`,
          });

          queryClient.invalidateQueries({
            queryKey: orpc.activity.byNewsId.queryKey({
              input: {
                newsId: data?.id as string,
                action: "share",
              },
            }),
          });
        },
      }
    );
  };

  const commentWithHeader = React.useMemo(
    () =>
      commentQuery.data
        ? ["HEADER", ...commentQuery.data.pages[0].docs.slice(0, 3)]
        : commentQuery.data,
    [commentQuery.data]
  );

  if (
    isFetchedAfterMount &&
    isError &&
    isDefinedError(error) &&
    error.data?.code === "NOT_FOUND"
  ) {
    // remove this news from cache
    navigation.replace("NotFound");
    return null;
  }

  // Other errors can be handled here if needed
  if (isFetchedAfterMount && (isError || !data)) {
    return (
      <YStack ai="center" flex={1} jc="center">
        <Text>Failed to load news article</Text>
      </YStack>
    );
  }

  return (
    <Screen safeAreaEdges={["top"]}>
      {data?.isLive && !auth.user ? (
        <View
          animation="easeIn"
          bg="$s400"
          enterStyle={{ y: -10 }}
          exitStyle={{ y: -10, animation: "easeOut" }}
          flex={0}
          key="offline"
          p="$0"
        >
          <Link screen="SignUp" style={{ width: "100%" }}>
            <XStack ai="center" gap="$3" px={5} py="$1">
              <InfoFill color="white" />
              <Paragraph color="white" fos={16}>
                Register to earn points for joining Live stream
              </Paragraph>
            </XStack>
          </Link>
        </View>
      ) : null}
      <Skeleton.Group show={isPending || isLoading}>
        <Skeleton
          colorMode="light"
          height={(width / 16) * 9}
          radius={0}
          width="100%"
        >
          <YoutubePlayer
            height={(width / 16) * 9}
            onChangeState={onStateChange}
            play={ytState === "playing"}
            videoId={data?.url?.split("/").at(-1)}
            // onReady={() => console.log("ready")}
          />
        </Skeleton>
        <Stack gap="$7" px="$3" py="$3">
          <Skeleton colorMode="light" height={70} width="100%">
            <Heading fontSize={20} lh={25}>
              {data?.title}
            </Heading>
          </Skeleton>

          <XStack ai="center" jc="space-between">
            <Skeleton colorMode="light" height={17} width={90}>
              <XStack ai="center" gap="$0.75">
                <User size={15} />
                <Text fontWeight="700">
                  {(data?.author as Admin)?.fullName}
                </Text>
              </XStack>
            </Skeleton>

            <Skeleton colorMode="light" height={17} width={110}>
              <Text color="#737373" fos={12}>
                {data && format(new Date(data?.createdAt), "do MMMM yyy | p")}
              </Text>
            </Skeleton>
          </XStack>
        </Stack>
        {/* comment list */}
        <Stack flex={1} gap="$4" px="$2">
          {!commentQuery.data || commentQuery.data?.pages[0].totalDocs < 1 ? (
            <Stack flex={1}>
              <H5 bc="$background" fontWeight="400" pl="$2" py="$2">
                Comments
              </H5>
              <Stack ai="center" flex={1} jc="center">
                <Text fos={15} textAlign="center">
                  Be the first to comment
                </Text>
                <Button
                  onPress={() =>
                    navigation.navigate("LiveComment", {
                      newsId: data?.id as string,
                      newsSlug: data?.slug as string,
                    })
                  }
                >
                  <Button.Text>Comment</Button.Text>
                </Button>
              </Stack>
            </Stack>
          ) : (
            <FlashList
              contentContainerStyle={{ paddingBottom: 60 }}
              data={commentWithHeader}
              ListEmptyComponent={commentQuery.isPending ? <Spinner /> : null}
              ListFooterComponent={
                commentQuery.data?.pages[0].totalDocs > 3 ? (
                  <Button
                    onPress={() =>
                      navigation.navigate("LiveComment", {
                        newsId: data?.id as string,
                        newsSlug: data?.slug as string,
                      })
                    }
                  >
                    <Button.Text>See all comments</Button.Text>
                  </Button>
                ) : null
              }
              // showsVerticalScrollIndicator={false}
              // estimatedItemSize={155}
              renderItem={({ item }) =>
                typeof item === "string" ? (
                  <H5 bc="$background" fontWeight="400" pl="$2" py="$2">
                    Comments
                  </H5>
                ) : (
                  <CommentCard comment={item} key={item.id} />
                )
              }
              stickyHeaderHiddenOnScroll
              stickyHeaderIndices={[0]}
            />
          )}
        </Stack>
        <NewsActionBar
          news={data}
          onDislike={handleDislike}
          onLike={handleLike}
          onShare={onShare}
        />
      </Skeleton.Group>
    </Screen>
  );
}

export default Live;
