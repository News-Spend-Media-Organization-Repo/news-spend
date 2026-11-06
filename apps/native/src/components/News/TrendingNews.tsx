import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { News } from "@news-spend-media/payload/types";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { Card } from "heroui-native/card";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import {
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  type ScrollViewProps,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useImpressionViewability } from "#/hooks/news/useImpressionViewability";
import { isAdReady, shouldShowNewsClickAd } from "#/state/adManager";
import { appOpenAdSheetState } from "#/state/appOpenAdState";
import { getImageData } from "#/utils/getImageData";
import { Text } from "../heroui/text";
import { SizedImage } from "../SizedImage";
import {
  nextTrendingIndex,
  TRENDING_AUTO_ADVANCE_MS,
  type TrendingDirection,
  type TrendingVisibility,
} from "./trendingCarousel";

export { nextTrendingIndex } from "./trendingCarousel";

const SPACING = 5;
const { width, height } = Dimensions.get("window");
const ITEM_WIDTH = width * 0.88;
const ITEM_HEIGHT = height * 0.3;
const FULL_SIZE = ITEM_WIDTH + SPACING * 2;

const CustomScrollView = (props: ScrollViewProps) => <ScrollView {...props} />;

export default function TrendingNews({
  news,
  visibilityRef,
}: {
  news: News[];
  visibilityRef?: RefObject<TrendingVisibility>;
}) {
  const listRef = useRef<LegendListRef | null>(null);
  const focused = useIsFocused();
  const indexRef = useRef(0);
  const directionRef = useRef<TrendingDirection>(1);
  const draggingRef = useRef(false);
  // Restarts the auto-advance countdown; set by the effect below.
  const restartAutoAdvanceRef = useRef<() => void>(() => {
    // Replaced once the interval effect mounts.
  });
  const count = news.length;
  const viewabilityConfigCallbackPairs =
    useImpressionViewability("HomeTrending");
  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<News>) => (
      <TrendingNewsItem item={item} />
    ),
    []
  );

  useEffect(() => {
    if (!focused || count <= 1) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleNext = () => {
      // Cancel the pending tick first: a manual swipe calls this to restart
      // the countdown, and leaving the old timeout alive would double it.
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        // Never advance while hidden: the impression hook counts any card that
        // becomes visible, even one the reader has not scrolled to. Nor while
        // the reader is dragging.
        if (draggingRef.current || visibilityRef?.current?.visible === false) {
          scheduleNext();
          return;
        }
        const next = nextTrendingIndex(
          indexRef.current,
          count,
          directionRef.current
        );
        indexRef.current = next.index;
        directionRef.current = next.direction;
        listRef.current?.scrollToOffset({
          offset: next.index * FULL_SIZE,
          animated: true,
        });
        scheduleNext();
      }, TRENDING_AUTO_ADVANCE_MS);
    };

    scheduleNext();
    restartAutoAdvanceRef.current = scheduleNext;

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      restartAutoAdvanceRef.current = () => {
        // Unmounted: nothing left to restart.
      };
    };
  }, [focused, count, visibilityRef]);

  const onScrollBeginDrag = useCallback(() => {
    draggingRef.current = true;
  }, []);
  const onScrollEndDrag = useCallback(() => {
    draggingRef.current = false;
    // A manual swipe restarts the countdown, so the carousel waits a full
    // cycle before moving itself instead of finishing a nearly-due one.
    restartAutoAdvanceRef.current();
  }, []);
  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / FULL_SIZE);
      indexRef.current = Math.max(0, Math.min(index, count - 1));
    },
    [count]
  );

  return (
    <LegendList
      data={news}
      decelerationRate="fast"
      estimatedItemSize={355.625}
      horizontal
      keyExtractor={(item, index) => `${item.id}-${index}`}
      onMomentumScrollEnd={onMomentumScrollEnd}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      pagingEnabled
      recycleItems
      ref={listRef}
      renderItem={renderItem}
      renderScrollComponent={CustomScrollView}
      showsHorizontalScrollIndicator={false}
      snapToAlignment="center"
      snapToInterval={FULL_SIZE}
      style={{ height: ITEM_HEIGHT }}
      viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
      // suggestEstimatedItemSize
    />
  );
}

const TrendingNewsItem = ({ item }: { item: News }) => {
  const navigation = useNavigation("NewsHome");
  const { url, fallbackUrl, blurhash } = getImageData(item?.image, "mobile");

  const onAdClose = useCallback(() => {
    navigation.navigate("News", {
      slug: item.slug,
      id: item.id,
    });
  }, [item, navigation]);

  const onPress = useCallback(() => {
    if (
      shouldShowNewsClickAd() &&
      (isAdReady("news-click-ads") || appOpenAdSheetState.nativeAdReady)
    ) {
      appOpenAdSheetState.open("news-click-ads", onAdClose);
    } else {
      navigation.navigate("News", {
        slug: item.slug,
        id: item.id,
      });
    }
  }, [item, navigation, onAdClose]);

  return (
    <Pressable onPress={onPress}>
      <Card
        className="overflow-hidden rounded-xl p-0"
        style={{
          height: ITEM_HEIGHT,
          width: ITEM_WIDTH,
          marginHorizontal: SPACING,
        }}
      >
        <Card.Footer className="absolute inset-x-0 bottom-0 z-10 flex-1 bg-p-500">
          <Text className="px-5 py-3 font-bold text-s-50" numberOfLines={2}>
            {item.title}
          </Text>
        </Card.Footer>
        <SizedImage
          className="absolute inset-0"
          contentFit="cover"
          fallbackSource={fallbackUrl}
          placeholder={{
            blurhash,
          }}
          placeholderContentFit="cover"
          recyclingKey={item.id}
          source={url}
          style={{ height: ITEM_HEIGHT }}
        />
      </Card>
    </Pressable>
  );
};
