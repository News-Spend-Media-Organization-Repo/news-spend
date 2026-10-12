import type { Activity, News } from "@news-spend-media/payload/types";
import { useFocusEffect } from "@react-navigation/native";
import { isSameDay } from "date-fns/isSameDay";
import { useCallback, useRef, useState } from "react";
import {
  AppState,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSnapshot } from "valtio";

import { authState } from "#/state/auth";

/**
 * How far into an article, and for how long, before a read counts as real.
 *
 * These were 85% and 90 seconds, which meant only a reader who sat with an
 * article long enough to time it earned anything. A glance through — open,
 * skim, leave — paid nothing, which is what the owner meant by "points should
 * not get awarded just because they clicked the news". The bar is now a
 * genuine but unhurried read: far enough in to have seen the piece, long
 * enough that it was not a mis-tap.
 */
const SCROLL_THRESHOLD = 0.3;
export const MIN_READING_SECONDS = 10;

/**
 * A flick faster than this (px/ms over a rolling window) reads as skimming.
 * It pauses the clock, but it no longer vetoes anything: a fast reader is
 * still a reader, and vetoing on speed is what made quick-but-genuine reads
 * pay nothing. Speed is not sent with the read event, so nothing downstream
 * sees it — it only ever fed the pause.
 */
const RAPID_SCROLL_THRESHOLD = 120;
const SPEED_WINDOW = 10;

export function useReadingTracker(
  data: News,
  userPointData: Activity[] | undefined
) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hasScrolledThreshold, setHasScrolledThreshold] = useState(false);
  const [inRapidScroll, setInRapidScroll] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const intervalId = useRef<NodeJS.Timeout | null>(null);
  const lastScrollY = useRef(0);
  const lastScrollTime = useRef<number | null>(null);
  const speedSamples = useRef<number[]>([]);
  // Deepest point reached, 0 to 1. Reported with a read so the depth is
  // measured, not assumed.
  const maxScrollDepth = useRef(0);
  const { user } = useSnapshot(authState);

  // Whether there is an article body on screen to measure against. A falsy
  // `content` means "still loading" or "this article has no body", and the
  // reader renders a placeholder for both, so neither can be read.
  const hasContent = Boolean(data?.content);

  /**
   * Record how far into the article the reader has got, 0 to 1.
   *
   * Depth only counts once the body has rendered. Until it does the screen is
   * a single fixed 60vh skeleton — the reader swaps to one whenever
   * `!data.content` — so measuring against that block satisfies the threshold
   * by itself. That is how an article which never rendered, or has no body at
   * all (a video-only entry), could still bank a read: what was scrolled was
   * the placeholder, not the article.
   */
  const recordDepth = useCallback(
    (scrolledPercentage: number) => {
      if (!hasContent) {
        return;
      }

      maxScrollDepth.current = Math.max(
        maxScrollDepth.current,
        Math.min(1, scrolledPercentage)
      );

      if (!hasScrolledThreshold && scrolledPercentage >= SCROLL_THRESHOLD) {
        setHasScrolledThreshold(true);
      }
    },
    [hasContent, hasScrolledThreshold]
  );

  const stopTracking = useCallback(() => {
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }
    setIsTracking(false);
  }, []);

  const startTracking = useCallback(() => {
    if (intervalId.current) {
      return;
    }
    intervalId.current = setInterval(() => {
      setElapsedSeconds((prev) => {
        if (prev >= MIN_READING_SECONDS) {
          stopTracking();
          return MIN_READING_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
    setIsTracking(true);
  }, [stopTracking]);

  useFocusEffect(
    useCallback(() => {
      const dailyRead = (user?.dailyRead as unknown as {
        count: number;
        updatedAt: Date;
      }) ?? { count: 0, updatedAt: new Date() };

      const readCountToday = isSameDay(dailyRead.updatedAt, new Date())
        ? dailyRead.count
        : 0;

      if (!(data && user) || userPointData?.length || readCountToday >= 5) {
        return;
      }

      // Reset all state on focus.
      setElapsedSeconds(0);
      setHasScrolledThreshold(false);
      setInRapidScroll(false);
      setIsTracking(false);
      // Depth belongs to an article, so it resets with the rest of the read —
      // otherwise the next article reports the previous one's depth.
      maxScrollDepth.current = 0;
      lastScrollY.current = 0;
      lastScrollTime.current = null;
      speedSamples.current = [];

      // Start the clock on focus, not on the first scroll. It used to begin
      // only once the reader scrolled, so someone who opened an article and
      // read it without moving the content accrued no time at all however long
      // they stayed — and no amount of relaxing the thresholds could help
      // them. Reading does not require scrolling; it requires the article
      // being on screen, which is what this measures.
      startTracking();

      // Screen focus alone is not enough: a backgrounded app keeps its focused
      // screen. Pause when the app leaves the foreground, resume when it comes
      // back, so a phone left face-up on an article does not silently bank
      // credit for a reader who is not there.
      const subscription = AppState.addEventListener("change", (status) => {
        if (status === "active") {
          startTracking();
        } else {
          stopTracking();
        }
      });

      return () => {
        stopTracking();
        subscription.remove();
      };
    }, [data, user, userPointData, startTracking, stopTracking])
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const scrollY = contentOffset.y;
      const currentTime = Date.now();

      // Depth belongs to the article body, so `recordDepth` ignores it while
      // there is only a placeholder on screen.
      const scrolledPercentage =
        (scrollY + layoutMeasurement.height) / contentSize.height;
      recordDepth(scrolledPercentage);

      // Resume the timer if a scroll arrives while it is paused (it can only
      // be paused by rapid-scroll detection or the app going to background).
      if (!(inRapidScroll || intervalId.current)) {
        startTracking();
      }

      // Rolling average speed: wait until window is full before judging
      if (lastScrollTime.current !== null) {
        const timeDiff = currentTime - lastScrollTime.current;
        const offsetDiff = Math.abs(scrollY - lastScrollY.current);
        const speed = offsetDiff / timeDiff;

        speedSamples.current.push(speed);
        if (speedSamples.current.length > SPEED_WINDOW) {
          speedSamples.current.shift();
        }

        // Don't judge until window is full
        if (speedSamples.current.length < SPEED_WINDOW) {
          lastScrollY.current = scrollY;
          lastScrollTime.current = currentTime;
          return;
        }

        const avgSpeed =
          speedSamples.current.reduce((a, b) => a + b, 0) /
          speedSamples.current.length;

        if (avgSpeed > RAPID_SCROLL_THRESHOLD) {
          if (!inRapidScroll) {
            console.log(
              "[ReadingTracker] Rapid scroll detected: pausing timer"
            );
            stopTracking();
            setInRapidScroll(true);
          }
        } else if (inRapidScroll && avgSpeed < RAPID_SCROLL_THRESHOLD * 0.5) {
          setInRapidScroll(false);
          startTracking();
        }
      }

      lastScrollY.current = scrollY;
      lastScrollTime.current = currentTime;
    },
    [inRapidScroll, startTracking, stopTracking, recordDepth]
  );

  return {
    elapsedSeconds,
    minReadingSeconds: MIN_READING_SECONDS,
    hasScrolledThreshold,
    inRapidScroll,
    isTracking,
    handleScroll,
    stopTracking,
    getMaxScrollDepth: () => maxScrollDepth.current,
  };
}
