// biome-ignore lint/style/useFilenamingConvention: PascalCase matches existing convention

import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type {
  PartnerContent,
  PromoImage,
  PromoVideoSource,
} from "@news-spend-media/payload/types";
import { Share2 } from "@tamagui/lucide-icons";
import * as VideoThumbnails from "expo-video-thumbnails";
import type React from "react";
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { type ScrollViewProps, useWindowDimensions } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import Share from "react-native-share";
import { toast } from "sonner-native";
import { Stack, Text, XStack } from "tamagui";

import { Button, Image } from "#/components/ui";
import PromoVideo from "#/components/videoPlayer/PromoVideo";
import YoutubePromoPlayer from "#/components/videoPlayer/YoutubePromoPlayer";
import useAddActivity from "#/hooks/point/useAddActivity";
import { authState } from "#/state/auth";
import { getImageData } from "#/utils/getImageData";

export type AdCarouselRef = {
  play: () => void;
  pause: () => void;
  isPlaying: () => boolean;
};

type AdCarouselProps = {
  item: PartnerContent;
};

type CarouselItemData = {
  layout?: (PromoVideoSource | PromoImage)[] | null | undefined;
  id?: string | null | undefined;
};

const CustomScrollView = (props: ScrollViewProps) => <ScrollView {...props} />;

const VideoComponent = memo(
  ({
    item,
    adCarouselRef,
  }: {
    item: PromoVideoSource;
    adCarouselRef: React.RefObject<AdCarouselRef | null>;
  }) => {
    const [activated, setActivated] = useState(false);
    const [thumbnail, setThumbnail] = useState<{
      uri: string;
      width: number;
      height: number;
    } | null>(null);

    const handleActivate = useCallback(() => {
      setActivated(true);
    }, []);

    const uploadUrl =
      item.videoSource === "upload" && typeof item.video === "object"
        ? (item.video?.url ?? undefined)
        : undefined;
    const resolvedUrl = uploadUrl ?? item.url ?? null;

    useEffect(() => {
      if (!resolvedUrl) return;

      VideoThumbnails.getThumbnailAsync(resolvedUrl, {
        time: 1000,
        quality: 0.8,
      })
        .then((thumb) => {
          if (thumb?.uri) {
            setThumbnail({
              uri: thumb.uri,
              width: thumb.width,
              height: thumb.height,
            });
          }
        })
        .catch(() => {});
    }, [resolvedUrl]);

    if (item.videoSource === "upload" || item.videoSource === "normal") {
      return (
        <Stack h="100%" w="100%">
          <PromoVideo
            autoPlay={activated}
            item={{ ...item, url: activated ? resolvedUrl : null }}
            posterSource={thumbnail}
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
  },
  (prevProps, nextProps) => prevProps.item.id === nextProps.item.id
);

// ---------------------------------------------------------------------------
// CarouselItem
// ---------------------------------------------------------------------------
const CarouselItem = memo(
  ({
    item,
    index,
    width,
    adCarouselRef,
  }: {
    item: CarouselItemData;
    index: number;
    width: number;
    adCarouselRef: React.RefObject<AdCarouselRef | null>;
  }) => {
    const blk = item.layout?.[0];
    const isFirstItem = index === 0;

    const { url, blurhash } = useMemo(
      () =>
        getImageData(blk?.blockType === "promo-image" ? blk?.image : undefined),
      [blk]
    );

    const itemWidth = isFirstItem ? width * 0.85 : 120;

    return (
      <Stack
        br="$3"
        gap="$1"
        height={200}
        mr={15}
        overflow="hidden"
        w={itemWidth}
      >
        {blk?.blockType === "promo-video-source" ? (
          <VideoComponent adCarouselRef={adCarouselRef} item={blk} />
        ) : (
          <Image h="100%" placeholder={{ blurhash }} source={url} w="100%" />
        )}
      </Stack>
    );
  },
  (prevProps, nextProps) =>
    prevProps.item.id === nextProps.item.id &&
    prevProps.index === nextProps.index &&
    prevProps.width === nextProps.width
);

// ---------------------------------------------------------------------------
// AdCarousel
// ---------------------------------------------------------------------------
const AdCarousel: React.FC<
  AdCarouselProps & { listRef?: React.Ref<AdCarouselRef> }
> = ({ item, listRef }) => {
  const { width } = useWindowDimensions();
  const addActivityMutation = useAddActivity();

  const awardPoint = useCallback(() => {
    if (authState.status === "signOut") {
      return;
    }
    addActivityMutation.mutate(
      {
        action: "share",
        type: "point",
        point: item?.points,
        description: `Shared Promotion Video ${item?.title || ""}`,
      },
      {
        onSuccess: (_response) => {
          toast.success("Points earned", {
            description: `You earned ${item?.points} points for sharing promo video!`,
          });
        },
      }
    );
  }, [item?.points, item?.title, addActivityMutation]);

  const adCarouselRef = useRef<AdCarouselRef | null>(null);
  const promoListRef = useRef<LegendListRef | null>(null);
  const lastItem = useRef<PartnerContent | null>(item);

  if (lastItem.current !== item) {
    lastItem.current = item;
    promoListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }

  useImperativeHandle(
    listRef,
    () => ({
      play: () => {
        adCarouselRef.current?.play();
      },
      pause: () => {
        adCarouselRef.current?.pause();
      },
      isPlaying: () => adCarouselRef.current?.isPlaying() ?? false,
    }),
    []
  );

  const keyExtractor = useCallback(
    (listItem: CarouselItemData) => listItem?.id ?? "",
    []
  );

  const renderItem = useCallback(
    ({
      index,
      item: listItem,
    }: LegendListRenderItemProps<CarouselItemData>) => (
      <CarouselItem
        adCarouselRef={adCarouselRef}
        index={index}
        item={listItem}
        width={width}
      />
    ),
    [width]
  );

  const onShare = useCallback(async () => {
    if (!item.items?.length) {
      return;
    }
    const blk = item.items?.[0].layout?.[0] as PromoVideoSource;
    const shareResponse = await Share.open({
      message: `Check out this amazing video on News Spend Media\n ${item.title}`,
      url: blk?.url ?? undefined,
      title: `Share promo video of ${item.title}`,
    });

    if (shareResponse.success) {
      awardPoint();
    }
  }, [item, awardPoint]);

  const onViewableItemsChanged = useRef<
    (info: {
      changed: {
        item: CarouselItemData;
        isViewable: boolean;
      }[];
    }) => void
  >(({ changed }) => {
    for (const change of changed) {
      const { item: listItem, isViewable } = change;
      if (
        listItem?.layout?.[0]?.blockType === "promo-video-source" &&
        !isViewable
      ) {
        adCarouselRef?.current?.pause();
      }
    }
  });

  const memoizedData = useMemo(() => item.items, [item.items]);

  return (
    <>
      <LegendList
        data={memoizedData}
        decelerationRate="fast"
        getItemType={(listItem) =>
          listItem?.layout?.[0]?.blockType === "promo-video-source"
            ? "video"
            : "image"
        }
        horizontal
        keyExtractor={keyExtractor}
        onViewableItemsChanged={onViewableItemsChanged.current}
        ref={promoListRef}
        renderItem={renderItem}
        renderScrollComponent={CustomScrollView}
        showsHorizontalScrollIndicator={false}
        snapToAlignment="center"
        snapToInterval={width * 0.9}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
          minimumViewTime: 100,
        }}
      />
      <XStack ai="center" gap="$5" jc="space-between">
        <Text color="$gray.50" flex={1} numberOfLines={2}>
          {item.title}: {item.condition}
        </Text>
        <Button ghost h="auto" onPress={onShare}>
          <Button.Icon color="black">
            <Share2 />
          </Button.Icon>
        </Button>
      </XStack>
    </>
  );
};

export default memo(AdCarousel);
