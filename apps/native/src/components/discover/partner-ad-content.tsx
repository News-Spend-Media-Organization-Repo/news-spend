import type { PartnerContent } from "@news-spend-media/payload/types";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo } from "react";
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
import { getImageData } from "#/utils/getImageData";

// ─── Types ────────────────────────────────────────────────────────────────────

type Ad = PartnerContent;

type PartnerAdContentProps = {
  ad: Ad;
  showAdLabel?: boolean;
  onAdClick: () => void;
  ytPlaying: boolean;
  onYtStateChange: (state: string) => void;
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
}: PartnerAdContentProps) {
  const { width, height } = useWindowDimensions();
  const { isDataSaverActive } = useVideoSettings();

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
  });
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { muted } = useEvent(player, "mutedChange", { muted: player.muted });

  const videoUrl = useMemo(() => {
    if (!isUploadedVideoAd) {
      return null;
    }
    if (ad.videoUrl) {
      return ad.videoUrl;
    }
    if (typeof ad.video === "string") {
      return ad.video;
    }
    if (ad.video && typeof ad.video === "object" && "url" in ad.video) {
      return ad.video.url;
    }
    return null;
  }, [isUploadedVideoAd, ad.videoUrl, ad.video]);

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
   * Stop on background and on unmount. Without this a dismissed ad kept
   * playing behind the dialog, and an ad left rolling while the app is
   * backgrounded burns data and battery for something nobody is watching.
   */
  useEffect(() => {
    if (!isUploadedVideoAd) {
      return;
    }
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        player.pause();
      }
    });
    return () => {
      subscription.remove();
      player.pause();
    };
  }, [isUploadedVideoAd, player]);

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
                  <SpeakerHighIcon color="white" size={18} />
                ) : (
                  <SpeakerSlashIcon color="white" size={18} />
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
