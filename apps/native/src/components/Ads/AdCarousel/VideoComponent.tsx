// biome-ignore lint/style/useFilenamingConvention: PascalCase matches existing convention

import type { PromoVideoSource } from "@news-spend-media/payload/types";
import type React from "react";
import { memo, useCallback, useState } from "react";
import { Stack, Text } from "tamagui";

import { Image } from "#/components/ui";
import PromoVideo from "#/components/videoPlayer/PromoVideo";
import YoutubePromoPlayer from "#/components/videoPlayer/YoutubePromoPlayer";

import type { AdCarouselRef } from "./types";

const VideoComponent = ({
  item,
  adCarouselRef,
}: {
  item: PromoVideoSource;
  adCarouselRef: React.RefObject<AdCarouselRef | null>;
}) => {
  const [activated, setActivated] = useState(false);

  const handleActivate = useCallback(() => {
    setActivated(true);
  }, []);

  const resolvedUrl =
    item.videoSource === "upload" && typeof item.video === "object"
      ? (item.video?.url ?? undefined)
      : (item.url ?? undefined);

  // Server-generated (or manually uploaded) thumbnail
  const thumbnailUri =
    typeof item.thumbnail === "object" && item.thumbnail !== null
      ? ((item.thumbnail as { url?: string }).url ?? null)
      : null;

  if (item.videoSource === "upload" || item.videoSource === "normal") {
    return (
      <Stack h="100%" w="100%">
        <PromoVideo
          autoPlay={activated}
          item={{
            ...item,
            url: activated ? resolvedUrl : null,
          }}
          posterSource={thumbnailUri ? { uri: thumbnailUri } : null}
          ref={adCarouselRef}
        />
        {!activated && (
          <Stack
            ai="center"
            bottom={0}
            jc="center"
            left={0}
            onPress={handleActivate}
            position="absolute"
            right={0}
            top={0}
          >
            {thumbnailUri && (
              <Image
                contentFit="cover"
                source={{ uri: thumbnailUri }}
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                }}
              />
            )}
            <Stack
              ai="center"
              backgroundColor="rgba(0,0,0,0.55)"
              borderRadius={40}
              h={80}
              jc="center"
              w={80}
            >
              <Text color="white" fontSize={32}>
                ▶
              </Text>
            </Stack>
          </Stack>
        )}
      </Stack>
    );
  }

  if (item.videoSource === "youtube") {
    return (
      <Stack h="100%" w="100%">
        <YoutubePromoPlayer item={item} ref={adCarouselRef} />
      </Stack>
    );
  }

  return null;
};

export default VideoComponent;
