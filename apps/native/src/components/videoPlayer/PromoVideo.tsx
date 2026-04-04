// biome-ignore lint/style/useFilenamingConvention: PascalCase matches existing convention in this directory
import type { PromoVideoSource } from "@news-spend-media/payload/types";
import { useIsFocused } from "@react-navigation/native";
import type { VideoSource } from "expo-video";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Stack } from "tamagui";

import { Image, Video, type VideoRef } from "#/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PromoVideoMethods = {
  play: () => void;
  pause: () => void;
  isPlaying: () => boolean;
  prepareVideo?: () => void;
};

type PromoVideoProps = {
  item: PromoVideoSource;
  onLoad?: () => void;
  autoPlay?: boolean;
  posterSource?: { uri: string; width: number; height: number } | null;
  ref?: Ref<PromoVideoMethods>;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PromoVideo = ({
  item,
  onLoad,
  autoPlay = false,
  posterSource,
  ref,
}: PromoVideoProps) => {
  const videoRef = useRef<VideoRef>(null);
  const focused = useIsFocused();

  const videoSource: VideoSource = useMemo(
    () =>
      item.url
        ? {
            uri: item.url,
            metadata: { title: "Promo Video", artist: "News Spend Media" },
            useCaching: true,
            headers: { "User-Agent": "NewsSpendMedia/1.0" },
          }
        : null,
    [item.url]
  );

  // Preload thumbnail via cache (Video component shows it as a poster if provided)
  // useEffect(() => {
  //   if (!autoPlay && item.url) {
  //     getThumbnailWithCache(item.url).catch((err) => {
  //       console.warn("Failed to preload thumbnail:", err);
  //     });
  //   }
  // }, [item.url, autoPlay]);

  // Auto-pause when screen loses focus
  useEffect(() => {
    if (!focused) {
      videoRef.current?.pause();
    }
  }, [focused]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        try {
          videoRef.current?.play();
        } catch {}
      },
      pause: () => {
        try {
          videoRef.current?.pause();
        } catch {}
      },
      isPlaying: () => {
        try {
          return videoRef.current?.isPlaying() ?? false;
        } catch {
          return false;
        }
      },

      prepareVideo: () => {
        videoRef.current?.play();
      },
    }),
    []
  );

  return (
    <Stack h="100%" w="100%" position="relative">
      <Video
        allowsPictureInPicture={false}
        autoPlay={autoPlay}
        contentFit="cover"
        loop
        onLoad={onLoad}
        ref={videoRef}
        source={videoSource}
        style={{ width: "100%", height: "100%", borderRadius: 10 }}
      />
      {!autoPlay && posterSource && (
        <Image
          source={posterSource}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            borderRadius: 10,
          }}
        />
      )}
    </Stack>
  );
};

PromoVideo.displayName = "PromoVideo";

export default PromoVideo;
