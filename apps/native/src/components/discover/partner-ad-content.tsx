import type { PartnerContent } from "@news-spend-media/payload/types";
import { useIsFocused } from "@react-navigation/native";
import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import { Button } from "#/components/heroui/button";
import { Image } from "#/components/heroui/image";
import { Text } from "#/components/heroui/text";
import { useVideoSettings } from "#/hooks/use-video-settings";
import {
  CaretRightIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "#/lib/icons";
import { getCtaLabel } from "#/utils";
import { adVideoUrl, cachedAdVideoUri } from "#/utils/adVideoCache";
import { getImageData } from "#/utils/getImageData";
import { type VideoEvent, videoEventsAt } from "#/utils/videoAdProgress";

// ─── Types ────────────────────────────────────────────────────────────────────

type Ad = PartnerContent;

type PartnerAdContentProps = {
  ad: Ad;
  showAdLabel?: boolean;
  onAdClick: () => void;
  ytPlaying: boolean;
  onYtStateChange: (state: string) => void;
  /** Reports whether an uploaded/external video is actually playing. */
  onPlaybackChange?: (playing: boolean) => void;
  /** Fires each playback-depth event once per ad. */
  onVideoEvent?: (event: VideoEvent) => void;
};

// ─── YouTube ID helper ────────────────────────────────────────────────────────

function extractYouTubeId(url: string): string {
  const match = url.match(
    /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
  );
  return match && match[2]?.length === 11 ? match[2] : "";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PartnerAdContent({
  ad,
  showAdLabel = true,
  onAdClick,
  ytPlaying,
  onYtStateChange,
  onPlaybackChange,
  onVideoEvent,
}: PartnerAdContentProps) {
  const { width, height } = useWindowDimensions();
  const { isDataSaverActive } = useVideoSettings();
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active"
  );

  const isYouTubeAd = ad.type === "video" && ad.videoType === "YOUTUBE";
  const isUploadedVideoAd =
    ad.type === "video" &&
    (ad.videoType === "UPLOAD" || ad.videoType === "EXTERNAL");
  // Only fall back to image if it's genuinely not a video of any kind
  const isImageAd = !(isUploadedVideoAd || isYouTubeAd);

  // ── Video player (only mounted for uploaded/external video ads) ──────────────
  /*
   * Muted from the start. Autoplay only works muted on both platforms, and an
   * ad that starts talking the moment a dialog opens is hostile — the mute
   * control below is the way up to sound, the same bargain Truecaller makes.
   */
  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.muted = true;
    // Android defaults to 20s ahead; a short ad should start, not fill a queue.
    p.bufferOptions = { preferredForwardBufferDuration: 2 };
    // Depth sampling: 0.5s is fine-grained enough to catch the last sample of
    // a 5s ad before the loop wraps, without a flood of events.
    p.timeUpdateEventInterval = 0.5;
  });
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { muted } = useEvent(player, "mutedChange", { muted: player.muted });
  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });

  // Non-video creatives report "playing" so the reward countdown cannot wedge
  // on a player that no longer exists.
  useEffect(() => {
    onPlaybackChange?.(isUploadedVideoAd ? isPlaying : true);
  }, [isUploadedVideoAd, isPlaying, onPlaybackChange]);

  // Depth is reported once per ad. The ref resets when the ad changes, so a
  // rotated creative starts a fresh pass.
  const firedVideoEvents = useRef<Set<VideoEvent>>(new Set());
  const onVideoEventRef = useRef(onVideoEvent);
  useEffect(() => {
    onVideoEventRef.current = onVideoEvent;
  }, [onVideoEvent]);
  useEffect(() => {
    firedVideoEvents.current = new Set();
  }, [ad.id]);

  const emitVideoEvents = useCallback((events: VideoEvent[]) => {
    for (const event of events) {
      if (firedVideoEvents.current.has(event)) {
        continue;
      }
      firedVideoEvents.current.add(event);
      onVideoEventRef.current?.(event);
    }
  }, []);

  useEffect(() => {
    if (isUploadedVideoAd && isPlaying) {
      emitVideoEvents(["video_start"]);
    }
  }, [isUploadedVideoAd, isPlaying, emitVideoEvents]);

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (isUploadedVideoAd) {
      emitVideoEvents(
        videoEventsAt(
          currentTime,
          player.duration,
          firedVideoEvents.current,
          0.5
        )
      );
    }
  });

  useEventListener(player, "playToEnd", () => {
    if (isUploadedVideoAd) {
      emitVideoEvents(["video_complete"]);
    }
  });

  // Resolved once per ad: swapping to the downloaded file mid-play would
  // restart a video the viewer is already watching.
  const videoUrl = useMemo(
    () =>
      isUploadedVideoAd ? (cachedAdVideoUri(ad.id) ?? adVideoUrl(ad)) : null,
    [isUploadedVideoAd, ad]
  );

  // The generated thumbnail covers uploads; external creatives fall back to
  // the banner image so the player is never a black rectangle.
  const posterUrl = useMemo(() => {
    if (!isUploadedVideoAd) {
      return null;
    }
    const uploaded = typeof ad.video === "object" ? ad.video : null;
    return (
      uploaded?.sizes?.videoThumbnail?.url ?? getImageData(ad.media).url ?? null
    );
  }, [isUploadedVideoAd, ad.video, ad.media]);

  useEffect(() => {
    if (!(isUploadedVideoAd && videoUrl)) {
      return;
    }
    player
      .replaceAsync({ uri: videoUrl, useCaching: !isDataSaverActive })
      .then(() => {
        /*
         * Data saver is a deliberate choice to not spend mobile data on
         * video, so it suppresses autoplay rather than just caching — the
         * play control still works for anyone who wants it.
         */
        if (!isDataSaverActive) {
          player.play();
        }
      })
      .catch(() => {
        // A source that won't load leaves the poster frame and controls.
      });
  }, [isUploadedVideoAd, videoUrl, player, isDataSaverActive]);

  /*
   * Stop when the screen or the app loses focus, and pick the video back up
   * when it returns. Without the resume, leaving for an advertiser's page
   * left the player paused and the reward countdown frozen; without the
   * focus half, the ad kept playing (audio included) behind the browser.
   *
   * Only a video that was already playing resumes: a deliberate pause stays
   * paused, and a data-saver ad nobody started does not start on return.
   */
  const resumeOnFocus = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    resumeOnFocus.current = false;
  }, [ad.id]);

  useEffect(() => {
    if (!isUploadedVideoAd) {
      return;
    }
    if (isFocused && appActive) {
      if (resumeOnFocus.current) {
        resumeOnFocus.current = false;
        player.play();
      }
    } else {
      resumeOnFocus.current = isPlayingRef.current;
      player.pause();
    }
  }, [appActive, isFocused, isUploadedVideoAd, player]);

  useEffect(() => {
    if (!isUploadedVideoAd) {
      return;
    }
    const subscription = AppState.addEventListener("change", (next) =>
      setAppActive(next === "active")
    );
    return () => subscription.remove();
  }, [isUploadedVideoAd]);

  // Unmount, or a rotation away from video, stops the sound.
  useEffect(
    () => () => {
      player.pause();
    },
    [player]
  );

  const togglePlaying = useCallback(() => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying, player]);

  // ── YouTube ──────────────────────────────────────────────────────────────────
  const videoId = useMemo(
    () => (isYouTubeAd && ad.videoUrl ? extractYouTubeId(ad.videoUrl) : null),
    [isYouTubeAd, ad.videoUrl]
  );

  // ── Image ────────────────────────────────────────────────────────────────────
  const { url: imageUrl, blurhash } = useMemo(
    () => getImageData(isImageAd ? ad.media : null),
    [isImageAd, ad.media]
  );

  const partner = typeof ad.partner === "string" ? null : ad.partner;
  const partnerLogo = useMemo(
    () => getImageData(partner?.logo),
    [partner?.logo]
  );

  return (
    /*
     * The click targets are the media and the CTA, nothing else. This used to
     * be onTouchEnd on the whole container, which meant pause and mute opened
     * the advertiser's link too, and any touch release — a scroll included —
     * counted as a click on the ad.
     */
    <View
      className="h-full gap-9 bg-white py-2"
      style={{ borderTopLeftRadius: 10, borderTopRightRadius: 10 }}
    >
      {/* ── Media ─────────────────────────────────────────────────────────── */}
      <View className="items-center justify-center gap-2 px-5">
        <Text>Advertisement</Text>

        {isUploadedVideoAd ? (
          <View
            className="relative mx-2 w-full"
            style={{ height: (width / 16) * 9 }}
          >
            <Pressable
              accessibilityLabel="Open advertisement"
              accessibilityRole="button"
              onPress={onAdClick}
              style={StyleSheet.absoluteFill}
            >
              <VideoView
                aria-label="Video advertisement"
                nativeControls={false}
                player={player}
                style={{ minHeight: "100%", width: "100%" }}
              />
              {status !== "readyToPlay" && posterUrl ? (
                <Image
                  aria-label="Video advertisement poster"
                  cachePolicy="memory-disk"
                  className="absolute inset-0"
                  contentFit="cover"
                  pointerEvents="none"
                  source={{ uri: posterUrl }}
                />
              ) : null}
            </Pressable>
            {/* box-none: taps on the bare overlay fall through to the video's
                press target, taps on the controls stay with the controls. */}
            <View
              className="absolute inset-0 flex-row items-end justify-start bg-transparent"
              pointerEvents="box-none"
            >
              <Button
                aria-label={isPlaying ? "Pause video" : "Play video"}
                className="rounded-none bg-black/50"
                onPress={togglePlaying}
                size="sm"
              >
                {isPlaying ? (
                  <PauseIcon color="white" size={18} />
                ) : (
                  <PlayIcon color="white" size={18} />
                )}
              </Button>
              <Button
                aria-label={muted ? "Unmute video" : "Mute video"}
                className="rounded-none bg-black/50"
                onPress={() => {
                  player.muted = !muted;
                }}
                size="sm"
              >
                {muted ? (
                  <SpeakerSlashIcon color="white" size={18} />
                ) : (
                  <SpeakerHighIcon color="white" size={18} />
                )}
              </Button>
            </View>
          </View>
        ) : isYouTubeAd ? (
          <YoutubePlayer
            aria-label="YouTube video advertisement"
            height={(width / 16) * 9}
            onChangeState={onYtStateChange}
            play={ytPlaying}
            videoId={videoId ?? ""}
          />
        ) : (
          <Pressable
            accessibilityLabel="Open advertisement"
            accessibilityRole="button"
            className="w-full"
            onPress={onAdClick}
          >
            <Image
              aria-label="Advertisement banner"
              cachePolicy="memory-disk"
              className="w-full"
              contentFit="contain"
              placeholder={{ blurhash }}
              recyclingKey={ad.id}
              source={imageUrl}
              style={{ height: height * 0.3 }}
            />
          </Pressable>
        )}

        {showAdLabel ? (
          <Text className="self-start border border-black px-1">Ad</Text>
        ) : null}
      </View>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <View className="items-center justify-center">
        <Image
          aria-label="Partner logo"
          cachePolicy="memory-disk"
          className="size-30"
          contentFit="contain"
          placeholder={{ blurhash: partnerLogo?.blurhash }}
          recyclingKey={partner?.id}
          source={{ uri: partnerLogo?.url ?? undefined }}
        />
        <Text className="text-center font-bold text-lg">{ad.title}</Text>
        <Text className="max-w-87.5 text-center text-base">{ad.condition}</Text>
        <Button
          className="mt-5 min-w-30 gap-2 rounded-full"
          onPress={onAdClick}
        >
          <Button.Label>{getCtaLabel(ad.cta)}</Button.Label>
          <CaretRightIcon color="white" size={18} weight="bold" />
        </Button>
      </View>
    </View>
  );
}
