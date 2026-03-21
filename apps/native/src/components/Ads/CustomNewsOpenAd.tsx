import type { PartnerContent } from "@news-spend-media/payload/types";
import { Pause, Play, Volume2, VolumeOff } from "@tamagui/lucide-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Platform, useWindowDimensions } from "react-native";
import Video, { type VideoRef } from "react-native-video";
import YoutubePlayer from "react-native-youtube-iframe";
import { H3, Spinner, Stack, Text, XStack } from "tamagui";

import { Button, Image } from "#/components/ui";
import { getThumbnailWithCache } from "#/components/videoPlayer/thumbnailCache";
import { getImageData } from "#/utils/getImageData";
import { getCtaLabel } from "#/utils/index";

function extractYouTubeId(url: string) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : "";
}

export default function CustomNewsOpenAd({ ad }: { ad: PartnerContent }) {
  const { width, height } = useWindowDimensions();

  const isVideoAd =
    ad.type === "video" &&
    (ad.videoType === "UPLOAD" || ad.videoType === "EXTERNAL");
  const isYouTubeAd = ad.type === "video" && ad.videoType === "YOUTUBE";
  const [ytPlaying, setYtPlaying] = useState(false);
  const isImageAd = !isVideoAd;
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [isLoading, setLoading] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const { url, blurhash } = getImageData(isImageAd ? ad.media : null);
  const partnerLogo = getImageData(
    ad.partner &&
      typeof ad.partner === "object" &&
      "logo" in ad.partner &&
      typeof ad.partner.logo !== "string"
      ? ad.partner.logo
      : null
  );

  const videoRef = useRef<VideoRef>(null);

  useEffect(() => {
    if (isVideoAd) {
      const videoSourceUri = ad.videoUrl
        ? ad.videoUrl
        : typeof ad.video === "string"
          ? ad.video
          : ad.video?.url;

      if (videoSourceUri) {
        videoRef.current?.setSource({
          uri: videoSourceUri,
        });
        videoRef.current?.resume();

        let isMounted = true;
        (async () => {
          const uri = await getThumbnailWithCache(videoSourceUri);
          if (isMounted) {
            setThumbnail(uri);
          }
        })();

        return () => {
          isMounted = false;
        };
      }
    }
  }, [ad.video, ad.videoUrl, isVideoAd]);

  const onStateChange = useCallback((state: string) => {
    if (state === "ended") {
      setYtPlaying(false);
    }
  }, []);

  const videoId = useMemo(() => {
    if (isYouTubeAd && ad.videoUrl) {
      return extractYouTubeId(ad.videoUrl);
    }
    return null;
  }, [isYouTubeAd, ad.videoUrl]);

  const getLink = useCallback(() => {
    let url = Platform.select({
      ios: ad.links?.iosAppStore,
      android: ad.links?.androidPlayStore,
    });
    if (!url) {
      url = ad.links?.website;
    }
    return url;
  }, [ad.links?.androidPlayStore, ad.links?.iosAppStore, ad.links?.website]);

  const onPress = useCallback(() => {
    const url = getLink();
    if (url) {
      Linking.openURL(url);
    }
  }, [getLink]);

  const onEnd = useCallback(() => {
    setPaused(true);
    videoRef.current?.seek(0);
  }, []);

  const onLoadStart = useCallback(() => {
    setLoading(true);
  }, []);

  const handlePlay = useCallback(() => {
    setPaused((prev) => !prev);
  }, []);

  const onLoad = useCallback(() => {
    setLoading(false);
  }, []);

  // {error && (
  //   <YStack jc="center" ai="center" flex={1}>
  //     <Text color="$red10">{error}</Text>
  //   </YStack>
  // )}
  return (
    <Stack
      bg="$background"
      borderTopLeftRadius={10}
      borderTopRightRadius={10}
      flex={1}
      py="$2"
    >
      <Text ta="center">Advertisement</Text>
      <Stack position="relative" width="100%">
        {isVideoAd ? (
          <Stack height={(width / 16) * 9} mx={8} pos="relative">
            <Video
              muted={muted}
              onEnd={onEnd}
              onLoad={onLoad}
              onLoadStart={onLoadStart}
              paused={paused}
              poster={{
                source: {
                  uri: thumbnail ?? undefined,
                },
                resizeMode: "cover",
              }}
              ref={videoRef}
              resizeMode="cover"
              style={{
                minHeight: "100%",
                width: "100%",
              }}
            />

            <Stack
              alignItems="flex-start"
              bg="transparent"
              bottom={0}
              justifyContent="flex-end"
              left={0}
              position="absolute"
              right={0}
              top={0}
            >
              {isLoading ? (
                <Stack
                  ai="center"
                  als="center"
                  h="100%"
                  jc="center"
                  pos="absolute"
                  zi={2}
                >
                  <Spinner color="$gray.50" />
                </Stack>
              ) : null}
              {/* Buttons Container */}
              <XStack>
                <Button
                  accessibilityLabel={paused ? "Play video" : "Pause video"}
                  bg="rgba(0,0,0,0.5)"
                  br={0}
                  onPress={handlePlay}
                  size="$2.5"
                >
                  <Button.Icon color="white">
                    {paused ? <Play /> : <Pause />}
                  </Button.Icon>
                </Button>
                <Button
                  accessibilityLabel={muted ? "Unmute video" : "Mute video"}
                  bg="rgba(0,0,0,0.5)"
                  borderRadius={0}
                  onPress={() => {
                    setMuted((prev) => !prev);
                  }}
                  size="$2.5"
                >
                  <Button.Icon color="white">
                    {muted ? <VolumeOff /> : <Volume2 />}
                  </Button.Icon>
                </Button>
              </XStack>
            </Stack>
          </Stack>
        ) : isYouTubeAd ? (
          <YoutubePlayer
            height={(width / 16) * 9}
            onChangeState={onStateChange}
            play={ytPlaying}
            videoId={videoId || ""}
          />
        ) : (
          <Image
            h={(width / 16) * 9}
            placeholder={{ blurhash }}
            placeholderContentFit="cover"
            source={url}
            w="100%"
          />
        )}
      </Stack>
      <Text als="flex-start" boc="$p400" br={3} bw={1} mx={8} my={12} px={1}>
        Ad
      </Text>

      <Stack ai="center" flex={1} jc="center">
        <Stack>
          <Image
            contentFit="contain"
            h={100}
            source={{
              uri: partnerLogo?.url || undefined,
            }}
            w={100}
          />
        </Stack>

        <Stack ai="center" jc="center" mb="$0">
          <H3 ta="center">{ad?.title}</H3>
          <Text fontSize={16} maxWidth={350} ta="center">
            {ad?.condition}
          </Text>
        </Stack>

        <Button
          borderRadius="$8"
          gap="$2"
          minWidth="$11"
          mt="$5"
          onPress={onPress}
        >
          <Button.Text>{getCtaLabel(ad.cta)}</Button.Text>
          {/*<Button.Icon>
            <CaretRight />
          </Button.Icon>*/}
        </Button>
      </Stack>
    </Stack>
  );
}
