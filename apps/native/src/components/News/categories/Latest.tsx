import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { PartnerContent } from "@news-spend-media/payload/types";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useScrollToTop } from "@react-navigation/native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Separator, Spinner } from "heroui-native";
import type { ComponentRef, JSX, RefObject } from "react";
import { memo, useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import { subscribeKey } from "valtio/utils";
import type { AdCarouselRef } from "#/components/Ads/AdCarousel";
import AdCarousel from "#/components/Ads/AdCarousel";
import NewsItemAd from "#/components/Ads/NewsItemAd";
import type { NewsItemGoogleAdRef } from "#/components/Ads/NewsItemGoogleAd";
import NewsItemGoogleAds from "#/components/Ads/NewsItemGoogleAd";
import { useAllNews } from "#/hooks/news";
import { useNewsAnalytics } from "#/hooks/news/useNewsAnalytics";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc, type RouterOutputs } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { routeState } from "#/state/route-state";
import { clearTabAdCache } from "#/utils/ad-cache";
import HomeListHeader from "../HomeListHeader";
import HomeListSkeleton from "../HomeListSkeleton";
import NewsItem from "../NewsItem";
import RelatedNews from "../RelatedNews";
import RewardTaskItemCard from "../RewardTaskItem";

type ItemType = RouterOutputs["news"]["home"]["docs"][number];

const MemoizedListHeader = memo(
  ({
    news,
    specialCoverage,
    books,
  }: {
    news: RouterOutputs["news"]["home"]["docs"];
    specialCoverage: RouterOutputs["news"]["home"]["docs"];
    books: PartnerContent[];
  }) => <HomeListHeader books={books} news={news} specialCoverage={specialCoverage} />,
);

const MemoizedSeparator = memo(() => <Separator className="m-3" />);

const Latest = memo(({ ref }: { ref: RefObject<LegendListRef> }) => {
  const mediaRefs = useRef<(AdCarouselRef | null)[]>([]);
  // Keyed by ad item id — stable across recycles, unlike positional arrays
  const gBannerRefs = useRef<Map<string, NewsItemGoogleAdRef>>(new Map());
  const tabBarHeight = useBottomTabBarHeight();
  const { trackImpression } = useNewsAnalytics();
  const trackImpressionRef = useRef(trackImpression);
  useEffect(() => {
    trackImpressionRef.current = trackImpression;
  }, [trackImpression]);

  // Stable ref to feed data for use inside onViewableItemsChanged without
  // needing to re-create the callback on every render.
  const flattenedNewsRef = useRef<RouterOutputs["news"]["home"]["docs"] | undefined>(undefined);
  const videoNews = useAllNews({
    type: "video",
  });
  const flattenedVideoNews = videoNews?.data?.pages.flatMap((page) => page?.docs);

  const previousTabName = useRef(routeState.tabName);
  useEffect(() => {
    const unsubscribe = subscribeKey(routeState, "tabName", (v) => {
      if (v !== previousTabName.current && previousTabName.current === "latest") {
        for (const mediaRef of mediaRefs.current) {
          try {
            mediaRef?.pause();
          } catch {}
        }
      }
      previousTabName.current = v;
    });
    return unsubscribe;
  }, []);

  const {
    data: news,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isPending,
    refetch,
  } = useInfiniteQuery(
    orpc.news.home.infiniteOptions({
      input: (pageParam: number | undefined) => ({
        limit: 10,
        page: pageParam,
      }),
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: undefined,
      staleTime: 5 * 60 * 1000, // 5 min — prevents refetch on tab switch
      gcTime: 10 * 60 * 1000, // 10 min — keep cached data in memory
    }),
  );

  const partnerContent = useQuery(
    orpc.partnerContent.filtered.queryOptions({
      input: {
        placement: ["homepage-trending-books"],
        status: "active",
        limit: 12,
        page: 1,
      },
    }),
  );

  const flattenedPartnerContent = partnerContent?.data?.docs;

  const trendingNews = useQuery(orpc.news.trending.queryOptions({ input: { limit: 3 } }));

  const flattenedNews = news?.pages.flatMap((page) => page.docs);
  flattenedNewsRef.current = flattenedNews;

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);
  const trendingRefetch = useRefreshByUser(trendingNews.refetch);

  // #region Callbacks
  const resetInfiniteQueryPagination = useCallback(() => {
    const qKey = orpc.news.home.infiniteKey({
      input: (pageParam: number | undefined) => ({
        limit: 10,
        page: pageParam,
      }),
      initialPageParam: undefined,
    });

    queryClient.setQueryData(qKey, (oldData) => {
      if (!oldData) {
        return;
      }

      return {
        pages: oldData.pages.slice(0, 1),
        pageParams: oldData.pageParams.slice(0, 1),
      };
    });
  }, []);

  const keyExtractor = useCallback(
    (item: RouterOutputs["news"]["home"]["docs"][0]) => item?.id ?? "",
    [],
  );

  const handleRefresh = useCallback(() => {
    resetInfiniteQueryPagination();
    refetchByUser();
    trendingRefetch.refetchByUser();
    clearTabAdCache("latest");
    gBannerRefs.current.clear();
  }, [resetInfiniteQueryPagination, refetchByUser, trendingRefetch.refetchByUser]);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetching) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetching, fetchNextPage]);

  const getItemType = useCallback(
    (item) =>
      item?._type === "ad" && item?.type === "adCarousel"
        ? `adCarousel-${item?.videoSource}`
        : (item?.type ?? item?._type),
    [],
  );

  const renderItem = useCallback(
    ({ item, index }: LegendListRenderItemProps<RouterOutputs["news"]["home"]["docs"][number]>) => {
      let content: JSX.Element | null = null;

      if (item && "type" in item && (item.type === "article" || item.type === "video")) {
        content = <NewsItem latest news={item} />;
      } else if (item && "_type" in item && item._type === "relatedNews") {
        content = <RelatedNews news={"data" in item ? item.data : undefined} />;
      } else if (item && "type" in item && item.type === "adCarousel") {
        content = (
          <AdCarousel
            item={"payload" in item ? item.payload : undefined}
            listRef={(itemRef: ComponentRef<typeof AdCarousel> | null) => {
              mediaRefs.current[index] = itemRef;
            }}
          />
        );
      } else if (item && "_type" in item && item._type === "ad") {
        if ("type" in item && item.type === "gAd") {
          content = (
            <NewsItemGoogleAds
              index={index}
              item={item}
              ref={(itemRef: NewsItemGoogleAdRef | null) => {
                if (itemRef && item.id) {
                  gBannerRefs.current.set(item.id, itemRef);
                } else if (!itemRef && item.id) {
                  gBannerRefs.current.delete(item.id);
                }
              }}
              tab="latest"
            />
          );
        } else {
          content = <NewsItemAd index={index} item={item} />;
        }
      } else if (item && "_type" in item && item._type === "rewardTask") {
        content = <RewardTaskItemCard item={item} />;
      } else {
        content = null;
      }

      return <View className="px-3">{content}</View>;
    },
    [],
  );

  const FooterItem = useCallback(
    () =>
      hasNextPage && isFetching ? (
        <View className="flex items-center justify-center py-4">
          <Spinner size="lg" />
        </View>
      ) : null,
    [hasNextPage, isFetching],
  );

  const onViewableItemsChanged = useRef(({ changed }) => {
    for (const item of changed) {
      if (item.item.type === "adCarousel") {
        const cell = mediaRefs?.current[item.index];
        if (!item.isViewable && cell) {
          cell?.pause();
        }
      }

      // When a gAd becomes visible, preload the next 2 gAd slots ahead by
      // walking the feed data — refs are registered by id so position-safe.
      if (
        item.isViewable &&
        item.item?._type === "ad" &&
        item.item?.type === "gAd" &&
        item.item?.id
      ) {
        const feed = flattenedNewsRef.current;
        if (feed) {
          const startIdx = feed.findIndex((i) => i && "id" in i && i.id === item.item.id);
          let preloaded = 0;
          for (let i = startIdx + 1; i < feed.length && preloaded < 2; i++) {
            const next = feed[i];
            if (
              next &&
              "_type" in next &&
              next._type === "ad" &&
              "type" in next &&
              next.type === "gAd" &&
              "id" in next &&
              next.id
            ) {
              const nextRef = gBannerRefs.current.get(next.id);
              if (nextRef && !nextRef.isAdLoaded()) {
                nextRef.loadAd();
                preloaded++;
              }
            }
          }
        }
      }

      // Track impressions for article and video news items
      if (
        item.isViewable &&
        item.item &&
        "type" in item.item &&
        (item.item.type === "article" || item.item.type === "video") &&
        item.item.id
      ) {
        trackImpressionRef.current(
          { id: item.item.id, slug: item.item.slug },
          item.index,
          "HomeFeed",
        );
      }
    }
  });
  // #endregion
  useScrollToTop(ref);

  if (isPending || videoNews.isPending || partnerContent.isPending) {
    return <HomeListSkeleton />;
  }

  return (
    <LegendList
      contentContainerStyle={{
        paddingBottom: tabBarHeight / 2,
        paddingTop: 15,
      }}
      data={flattenedNews}
      // getEstimatedItemSize={getEstimatedItemSize}
      getItemType={getItemType}
      ItemSeparatorComponent={MemoizedSeparator}
      keyExtractor={keyExtractor}
      ListFooterComponent={FooterItem}
      ListHeaderComponent={
        <MemoizedListHeader
          books={flattenedPartnerContent ?? []}
          news={trendingNews.data ?? []}
          specialCoverage={flattenedVideoNews ?? []}
        />
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      onRefresh={handleRefresh}
      onViewableItemsChanged={onViewableItemsChanged.current}
      recycleItems
      ref={ref}
      refreshing={isRefetchingByUser}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      // suggestEstimatedItemSize
      viewabilityConfig={{
        itemVisiblePercentThreshold: 40,
      }}
    />
  );
});

export default Latest;
