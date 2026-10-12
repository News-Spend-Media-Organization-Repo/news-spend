import { useFocusEffect } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "#/components/heroui/toast";
import { userQueryOptions } from "#/hooks/auth/useUser";
import { getDeviceId, useNewsAnalytics } from "#/hooks/news/useNewsAnalytics";
import { useReadingTracker } from "#/hooks/news/useNewsTracker";
import { orpc } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { authState } from "#/state/auth";

export function useArticleTracking(data: ReturnType<typeof useNews>["data"]) {
  const recordViewMutation = useMutation(
    orpc.news.recordView.mutationOptions()
  );
  const addActivityMutation = useMutation(orpc.activity.add.mutationOptions());

  const {
    trackView,
    trackRead,
    trackLike,
    trackDislike,
    trackShare,
    trackComment,
  } = useNewsAnalytics(data ? { id: data.id, slug: data.slug } : undefined);

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
    getMaxScrollDepth,
  } = useReadingTracker(data, getUserPoint.data);

  // Track view + record view in one focus effect
  const hasTrackedView = useRef(false);
  const hasRecordedView = useRef(false);
  const prevId = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!data) {
        return;
      }

      // Reset flags when navigating to a different article
      if (prevId.current !== data.id) {
        hasTrackedView.current = false;
        hasRecordedView.current = false;
        prevId.current = data.id;
      }

      if (!hasTrackedView.current) {
        hasTrackedView.current = true;
        trackView();
      }

      if (!hasRecordedView.current) {
        hasRecordedView.current = true;
        recordViewMutation.mutate({ newsId: data.id, deviceId: getDeviceId() });
      }
    }, [data, trackView, recordViewMutation.mutate])
  );

  // A qualified read is a fact about how the article was read, so it is
  // recorded for everyone. It used to be emitted only from the points path
  // below, which meant readers who were signed out, had already earned the
  // points, or had hit the daily cap never produced one.
  //
  // No `inRapidScroll` veto: the points path deliberately dropped it so a fast
  // reader is not denied their points, and a read event that disagreed with
  // the award would have been the same decision made twice, differently.
  const trackedReadFor = useRef<string | null>(null);
  useEffect(() => {
    if (
      !data ||
      trackedReadFor.current === data.id ||
      !hasScrolledThreshold ||
      elapsedSeconds < minReadingSeconds
    ) {
      return;
    }
    trackedReadFor.current = data.id;
    trackRead(elapsedSeconds, getMaxScrollDepth());
  }, [
    data,
    hasScrolledThreshold,
    elapsedSeconds,
    minReadingSeconds,
    trackRead,
    getMaxScrollDepth,
  ]);

  // Award points once reading conditions are met
  useEffect(() => {
    const user = authState.user;
    if (
      user &&
      !user.isAnonymous &&
      data &&
      !addActivityMutation.isPending &&
      !addActivityMutation.isSuccess &&
      !addActivityMutation.isError &&
      !getUserPoint.data?.length &&
      // Deliberately no `inRapidScroll` veto here. A fast reader is still a
      // reader; blocking the award outright is what made quick-but-genuine
      // reads pay nothing. Skimming is now recorded on the read event above
      // and left for the analytics to interpret, rather than silently costing
      // someone their points.
      elapsedSeconds >= minReadingSeconds &&
      hasScrolledThreshold
    ) {
      stopTracking();
      addActivityMutation.mutate(
        {
          newsId: data.id,
          action: "read",
          type: "point",
          point: data.points ?? 0,
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
    data,
    getUserPoint.data,
    addActivityMutation.isPending,
    addActivityMutation.isSuccess,
    addActivityMutation.isError,
    stopTracking,
    addActivityMutation.mutate,
  ]);

  return {
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
  };
}
