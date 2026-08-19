import type { PartnerContent } from "@news-spend-media/payload/types";
import { Image } from "expo-image";
import { Spinner } from "heroui-native/spinner";
import {
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "phosphor-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, useWindowDimensions, View } from "react-native";
import Video, { type VideoRef } from "react-native-video";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import { getThumbnailWithCache } from "#/components/videoPlayer/thumbnailCache";
import { getImageData } from "#/utils/getImageData";
import { getCtaLabel } from "#/utils/index";

// YouTube removed: ToS violation in ad context

export default function CustomNewsOpenAd({ ad }: { ad: PartnerContent }) {
  const { width } = useWindowDimensions();

  const isVideoAd =
    ad.type === "video" &&
    (ad.videoType === "UPLOAD" || ad.videoType === "EXTERNAL");
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
    if (!isVideoAd) {
      return;
    }
    const videoSourceUri = ad.videoUrl
      ? ad.videoUrl
      : typeof ad.video === "string"
        ? ad.video
        : ad.video?.url;

    if (!videoSourceUri) {
      return;
    }

    videoRef.current?.setSource({ uri: videoSourceUri });
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
  }, [ad.video, ad.videoUrl, isVideoAd]);

  const onPress = useCallback(() => {
    const url =
      Platform.select({
        ios: ad.links?.iosAppStore,
        android: ad.links?.androidPlayStore,
      }) ?? ad.links?.website;
    if (url) {
      Linking.openURL(url);
    }
  }, [ad.links]);

  const videoHeight = (width / 16) * 9;

  return (
    <View className="flex-1 rounded-t-xl bg-background py-2">
      <Text className="text-center">Advertisement</Text>

      <View className="w-full">
        {isVideoAd ? (
          <View className="relative mx-2" style={{ height: videoHeight }}>
            <Video
              muted={muted}
              onEnd={() => {
                setPaused(true);
                videoRef.current?.seek(0);
              }}
              onLoad={() => setLoading(false)}
              onLoadStart={() => setLoading(true)}
              paused={paused}
              poster={{
                source: { uri: thumbnail ?? undefined },
                resizeMode: "cover",
              }}
              ref={videoRef}
              resizeMode="cover"
              style={{ minHeight: "100%", width: "100%" }}
            />
            <View className="absolute inset-0 items-start justify-end">
              {isLoading && (
                <View className="absolute inset-0 z-20 items-center justify-center">
                  <Spinner />
                </View>
              )}
              <View className="flex-row">
                <Button
                  accessibilityLabel={paused ? "Play video" : "Pause video"}
                  className="rounded-none bg-black/50"
                  onPress={() => setPaused((p) => !p)}
                  size="sm"
                >
                  {paused ? (
                    <PlayIcon color="white" size={16} />
                  ) : (
                    <PauseIcon color="white" size={16} />
                  )}
                </Button>
                <Button
                  accessibilityLabel={muted ? "Unmute video" : "Mute video"}
                  className="rounded-none bg-black/50"
                  onPress={() => setMuted((m) => !m)}
                  size="sm"
                >
                  {muted ? (
                    <Icon color="white" name={SpeakerSlashIcon} size={16} />
                  ) : (
                    <Icon color="white" name={SpeakerHighIcon} size={16} />
                  )}
                </Button>
              </View>
            </View>
          </View>
        ) : (
          <Image
            contentFit="contain"
            placeholder={{ blurhash }}
            placeholderContentFit="contain"
            source={url}
            style={{ height: videoHeight, width: "100%" }}
          />
        )}
      </View>

      <Text className="mx-2 my-3 self-start border border-p-400 px-px font-medium">
        Ad
      </Text>

      <View className="flex-1 items-center justify-center gap-4">
        <Image
          contentFit="contain"
          source={{ uri: partnerLogo?.url || undefined }}
          style={{ height: 120, width: 120 }}
        />
        <View className="items-center justify-center">
          <Text className="text-center font-bold text-xl">{ad?.title}</Text>
          <Text className="max-w-87.5 text-center text-base">
            {ad?.condition}
          </Text>
        </View>
        <Button className="mt-5 min-w-55" onPress={onPress}>
          {getCtaLabel(ad.cta)}
        </Button>
      </View>
    </View>
  );
}
