import type { PartnerContent } from "@news-spend-media/payload/types";
import { Pause, Play, Volume2, VolumeOff } from "@tamagui/lucide-icons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo } from "react";
import { useWindowDimensions } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import { H3, Stack, Text, XStack } from "tamagui";
import { CaretRight } from "tamagui-phosphor";

import { Button, Image } from "#/components/ui";
import { useVideoSettings } from "#/hooks/use-video-settings";
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
  return match && match[2].length === 11 ? match[2] : "";
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
  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
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
    if (isUploadedVideoAd && videoUrl) {
      player.replaceAsync({ uri: videoUrl, useCaching: !isDataSaverActive });
    }
  }, [isUploadedVideoAd, videoUrl, player, isDataSaverActive]);

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

  const partner = typeof ad.partner !== "string" ? ad.partner : null;
  const partnerLogo = useMemo(
    () => getImageData(partner?.logo),
    [partner?.logo]
  );

  return (
    <Stack
      bg="$background"
      borderTopLeftRadius={10}
      borderTopRightRadius={10}
      gap="$9"
      h="100%"
      onPress={onAdClick}
      py="$2"
      zi="$3"
    >
      {/* ── Media ─────────────────────────────────────────────────────────── */}
      <Stack ai="center" gap="$2" jc="center" px="$5">
        <Text>Advertisement</Text>

        {isUploadedVideoAd ? (
          <Stack height={(width / 16) * 9} mx={8} pos="relative" w="100%">
            <VideoView
              aria-label="Video advertisement"
              nativeControls={false}
              player={player}
              style={{ minHeight: "100%", width: "100%" }}
            />
            <Stack
              alignItems="flex-start"
              bg="transparent"
              bottom={0}
              justifyContent="flex-end"
              left={0}
              onPress={onAdClick}
              position="absolute"
              right={0}
              top={0}
            >
              <XStack>
                <Button
                  aria-label={isPlaying ? "Pause video" : "Play video"}
                  bg="rgba(0,0,0,0.5)"
                  br={0}
                  onPress={togglePlaying}
                  size="$2.5"
                >
                  <Button.Icon color="white">
                    {isPlaying ? <Pause /> : <Play />}
                  </Button.Icon>
                </Button>
                <Button
                  aria-label={muted ? "Unmute video" : "Mute video"}
                  bg="rgba(0,0,0,0.5)"
                  borderRadius={0}
                  onPress={() => {
                    player.muted = !muted;
                  }}
                  size="$2.5"
                >
                  <Button.Icon color="white">
                    {muted ? <Volume2 /> : <VolumeOff />}
                  </Button.Icon>
                </Button>
              </XStack>
            </Stack>
          </Stack>
        ) : isYouTubeAd ? (
          <YoutubePlayer
            aria-label="YouTube video advertisement"
            height={(width / 16) * 9}
            onChangeState={onYtStateChange}
            play={ytPlaying}
            videoId={videoId ?? ""}
          />
        ) : (
          <Image
            aria-label="Advertisement banner"
            height={height * 0.3}
            placeholder={{ blurhash }}
            source={imageUrl}
            width="100%"
          />
        )}

        {showAdLabel ? (
          <Text
            alignSelf="flex-start"
            borderColor="$color"
            borderWidth={1}
            px={1}
          >
            Ad
          </Text>
        ) : null}
      </Stack>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <Stack ai="center" jc="center">
        <Image
          aria-label="Partner logo"
          height={100}
          placeholder={{ blurhash: partnerLogo?.blurhash }}
          source={{ uri: partnerLogo?.url ?? undefined }}
          width={100}
        />
        <H3 ta="center">{ad.title}</H3>
        <Text fontSize={16} maxWidth={350} textAlign="center">
          {ad.condition}
        </Text>
        <Button
          borderRadius="$8"
          gap="$2"
          minWidth="$11"
          mt="$5"
          onPress={onAdClick}
        >
          <Button.Text>{getCtaLabel(ad.cta)}</Button.Text>
          <Button.Icon color="#fff">
            <CaretRight />
          </Button.Icon>
        </Button>
      </Stack>
    </Stack>
  );
}
