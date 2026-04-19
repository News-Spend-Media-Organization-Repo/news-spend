// biome-ignore lint/style/useFilenamingConvention: PascalCase matches existing convention

import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { PartnerContent, PromoVideoSource } from "@news-spend-media/payload/types";
import { Share2 } from "@tamagui/lucide-icons";
import type React from "react";
import { memo, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import { useWindowDimensions } from "react-native";
import Share from "react-native-share";
import { toast } from "sonner-native";
import { Text, XStack } from "tamagui";
import { Button } from "#/components/ui";
import useAddActivity from "#/hooks/point/useAddActivity";
import { authState } from "#/state/auth";
import CarouselItem, { CustomScrollView } from "./CarouselItem";
import type { AdCarouselProps, AdCarouselRef, CarouselItemData } from "./types";

const AdCarousel: React.FC<AdCarouselProps & { listRef?: React.Ref<AdCarouselRef> }> = ({
  item,
  listRef,
}) => {
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
      },
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
    [],
  );

  const keyExtractor = useCallback((listItem: CarouselItemData) => listItem?.id ?? "", []);

  const renderItem = useCallback(
    ({ index, item: listItem }: LegendListRenderItemProps<CarouselItemData>) => (
      <CarouselItem adCarouselRef={adCarouselRef} index={index} item={listItem} width={width} />
    ),
    [width],
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
      if (listItem?.layout?.[0]?.blockType === "promo-video-source" && !isViewable) {
        adCarouselRef?.current?.pause();
      }
    }
  });

  const memoizedData = useMemo(() => item.items ?? undefined, [item.items]);

  return (
    <>
      <LegendList
        data={memoizedData}
        // decelerationRate="fast"
        // getItemType={(listItem) =>
        //   listItem?.layout?.[0]?.blockType === "promo-video-source"
        //     ? "video"
        //     : "image"
        // }
        horizontal
        keyExtractor={keyExtractor}
        onViewableItemsChanged={onViewableItemsChanged.current}
        ref={promoListRef}
        renderItem={renderItem}
        renderScrollComponent={CustomScrollView}
        showsHorizontalScrollIndicator={false}
        // snapToAlignment="center"
        // snapToInterval={width * 0.9}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
          minimumViewTime: 100,
        }}
      />
      <XStack ai="center" gap="$5" jc="space-between">
        <Text color="$gray.50" flex={1} numberOfLines={2}>
          {item.title}: {item.condition}
        </Text>
        <Button ghost h="auto" onPress={() => console.log(adCarouselRef.current?.isPlaying())}>
          <Button.Icon color="black">
            <Share2 />
          </Button.Icon>
        </Button>
      </XStack>
    </>
  );
};

export default memo(AdCarousel);
