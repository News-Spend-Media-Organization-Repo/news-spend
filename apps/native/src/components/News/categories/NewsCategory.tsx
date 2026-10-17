import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { Separator } from "heroui-native/separator";
import { Spinner } from "heroui-native/spinner";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import NewsItemAds from "#/components/Ads/NewsItemAd";
import NewsItemGoogleAds from "#/components/Ads/NewsItemGoogleAd";
import { useAllNews } from "#/hooks/news";
import { NEWS_FEED_STALE_TIME_MS } from "#/hooks/news/constants";
import { useRefetchOnReturn } from "#/hooks/news/useRefetchOnReturn";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { useTabBarHeight } from "#/state/route-state";
import { markTabAdsStale, registerAdSlots } from "#/utils/ad-cache";
import { preloadAdsAhead } from "#/utils/ad-preload";
import { SCREENSHOT_MODE } from "#/utils/screenshotMode";
import NewsItem from "../NewsItem";
import NewsItemPlaceholder from "../NewsItemPlaceholder";

/** A Google ad row is taller than an article row: see MIN_AD_HEIGHT. */
const estimateItemSize = (_index: number, item: FeedAdItem) =>
  item?.type === "gAd" ? 150 : 116;

const MemoizedSeparator = memo(() => <Separator className="m-3" />);

type NewType = React.RefObject<LegendListRef>;

/** Just the fields the gAd-preload walk reads — see its comment below. */
type FeedAdItem = { _type?: string; type?: string; id?: string };

const NewsCategory = ({
  isActiveTab,
  route,
  ref,
}: {
  isActiveTab: boolean;
  route: string;
  ref?: NewType;
}) => {
  const tabBarHeight = useTabBarHeight();
  const {
    data,
    dataUpdatedAt,
    isPending,
    refetch,
    refetchFresh,
    fetchNextPage,
    isFetching,
    hasNextPage,
  } = useAllNews({
    category: route,
    ad: !SCREENSHOT_MODE,
  });

  // Pull-to-refresh is a deliberate user action, unlike the passive
  // refetches below — it always bypasses the server's composed-feed cache
  // and gets a genuinely fresh ad, not just whatever the last 90s window
  // happened to cache.
  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(() => {
    refetchFresh();
    markTabAdsStale(route);
    lastVisibleIndexRef.current = 0;
  });

  // Fresh list on return — same as Latest. Covers article-back, bottom-tab
  // switch, and switching back to this category tab.
  useRefetchOnReturn({
    dataUpdatedAt,
    isActiveTab,
    refetch,
    staleTime: NEWS_FEED_STALE_TIME_MS,
  });

  const flattenedNewsRef = useRef<any[] | undefined>(undefined);

  const renderItem = useCallback(
    ({ item, index }) => {
      if (item._type === "ad") {
        if (item.type === "gAd") {
          return <NewsItemGoogleAds index={index} item={item} tab={route} />;
        }
        if (item.type === "inHouse") {
          return <NewsItemAds item={item} />;
        }
        return null;
      }
      if (item.type === "article") {
        return <NewsItem news={item} />;
      }
      return null;
    },
    [route]
  );

  const FooterItem = useCallback(
    () =>
      hasNextPage && isFetching ? (
        <View className="flex items-center justify-center py-4">
          <Spinner size="lg" />
        </View>
      ) : null,
    [hasNextPage, isFetching]
  );

  const onEndReached = () => {
    if (hasNextPage && !isFetching) {
      fetchNextPage();
    }
  };

  const keyExtractor = useCallback((item) => item._id ?? item.id, []);
  const flattenedNews = data?.pages.flatMap((page) => page.docs);
  flattenedNewsRef.current = flattenedNews;

  // Register this tab's ad slots in order so a rebuilt feed (new random ids)
  // finds the ads already loaded; see registerAdSlots.
  useMemo(() => {
    registerAdSlots(
      route,
      ((flattenedNews ?? []) as FeedAdItem[]).flatMap((item) =>
        item._type === "ad" && item.type === "gAd" && item.id ? [item.id] : []
      )
    );
  }, [flattenedNews, route]);

  // Eagerly preload every gAd slot already loaded into this tab's feed, as
  // soon as its page arrives — same rationale as Latest.tsx. Independent
  // of scroll position or whether that row has even mounted yet;
  // ensureNativeAdLoaded is cache/in-flight-aware so repeat calls for ids
  // already loaded or in progress are a cheap no-op.
  const lastVisibleIndexRef = useRef(0);
  useEffect(() => {
    preloadAdsAhead(
      route,
      flattenedNews as FeedAdItem[] | undefined,
      lastVisibleIndexRef.current
    );
  }, [flattenedNews, route]);

  // Ads are requested a bounded distance ahead of what is on screen.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number }[] }) => {
      for (const item of viewableItems) {
        if (item.index > lastVisibleIndexRef.current) {
          lastVisibleIndexRef.current = item.index;
        }
      }
      preloadAdsAhead(
        route,
        flattenedNewsRef.current,
        lastVisibleIndexRef.current
      );
    },
    [route]
  );

  if (isPending) {
    return <NewsItemPlaceholder show />;
  }

  return (
    <LegendList
      contentContainerStyle={{
        paddingBottom: tabBarHeight + 20,
        paddingTop: 15,
        paddingHorizontal: 10,
      }}
      data={flattenedNews}
      getEstimatedItemSize={estimateItemSize}
      getItemType={(item) => item?.type ?? item?._type}
      ItemSeparatorComponent={MemoizedSeparator}
      keyExtractor={keyExtractor}
      ListFooterComponent={FooterItem}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      onRefresh={refetchByUser}
      onViewableItemsChanged={onViewableItemsChanged}
      recycleItems
      ref={ref}
      refreshing={isRefetchingByUser}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
    />
    // </Stack>
  );
};

export default memo(NewsCategory);
