import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { PartnerContent } from "@news-spend-media/payload/types";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useScrollToTop } from "@react-navigation/native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ComponentRef, JSX, RefObject } from "react";
import { memo, useCallback, useEffect, useRef } from "react";
import { Spinner, Stack } from "tamagui";
import { subscribeKey } from "valtio/utils";

import AdCarousel, { type AdCarouselRef } from "#/components/Ads/AdCarousel";
import NewsItemAd from "#/components/Ads/NewsItemAd";
import NewsItemGoogleAds, {
  type NewsItemGoogleAdRef,
} from "#/components/Ads/NewsItemGoogleAd";
import { useAllNews } from "#/hooks/news";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc, type RouterOutputs } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { routeState } from "#/state/route-state";
import { clearTabAdCache } from "#/utils/ad-cache";

import HomeListHeader from "../HomeListHeader";
import HomeListSkeleton from "../HomeListSkeleton";
import NewsItem from "../NewsItem";
import RelatedNews from "../RelatedNews";
import RewardTaskItem from "../RewardTaskItem";

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
  }) => (
    <HomeListHeader
      books={books}
      news={news}
      specialCoverage={specialCoverage}
    />
  )
);

const MemoizedSeparator = memo(() => (
  <Stack boc="#d7d7d7" bw="$0.25" mx="$3" my="$3" w="100%" />
));

const Latest = memo(({ ref }: { ref: RefObject<LegendListRef> }) => {
  const mediaRefs = useRef<(AdCarouselRef | null)[]>([]);
  const gBannerRefs = useRef<(NewsItemGoogleAdRef | null)[]>([]);
  const tabBarHeight = useBottomTabBarHeight();
  const loadedAds = useRef<Set<string>>(new Set());
  const videoNews = useAllNews({
    type: "video",
  });
  const flattenedVideoNews = videoNews?.data?.pages.flatMap(
    (page) => page?.docs
  );

  const previousTabName = useRef(routeState.tabName);
  useEffect(() => {
    const unsubscribe = subscribeKey(routeState, "tabName", (v) => {
      if (
        v !== previousTabName.current &&
        previousTabName.current === "latest"
      ) {
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
    })
  );

  const partnerContent = useQuery(
    orpc.partnerContent.filtered.queryOptions({
      input: {
        placement: ["homepage-trending-books"],
        status: "active",
        limit: 12,
        page: 1,
      },
    })
  );

  const flattenedPartnerContent = partnerContent?.data?.docs;

  const trendingNews = useQuery(
    orpc.news.trending.queryOptions({ input: { limit: 3 } })
  );

  const flattenedNews = news?.pages.flatMap((page) => page.docs);

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);
  const trendingRefetch = useRefreshByUser(trendingNews.refetch);

  useEffect(() => {
    if (!flattenedNews) return;

    flattenedNews.slice(0, 10).forEach((item, idx) => {
      if (
        item &&
        "_type" in item &&
        item._type === "ad" &&
        ("type" in item
          ? item.type === "gAd" || item.type === "inHouse"
          : false)
      ) {
        const cell = gBannerRefs.current[idx];
        const adId = item.id;
        if (adId && loadedAds.current.has(adId)) return;
        if (cell && !cell?.isAdLoaded()) {
          cell.loadAd();
          if (adId) loadedAds.current.add(adId);
        }
      }
    });
  }, [flattenedNews]);

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
      if (!oldData) return;

      return {
        pages: oldData.pages.slice(0, 1),
        pageParams: oldData.pageParams.slice(0, 1),
      };
    });
  }, []);

  const keyExtractor = useCallback(
    (item: RouterOutputs["news"]["home"]["docs"][0]) => item?.id ?? "",
    []
  );

  const handleRefresh = useCallback(() => {
    resetInfiniteQueryPagination();
    refetchByUser();
    trendingRefetch.refetchByUser();
    clearTabAdCache("latest");
    loadedAds.current.clear();
  }, [
    resetInfiniteQueryPagination,
    refetchByUser,
    trendingRefetch.refetchByUser,
  ]);

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
    []
  );

  const renderItem = useCallback(
    ({
      item,
      index,
    }: LegendListRenderItemProps<
      RouterOutputs["news"]["home"]["docs"][number]
    >) => {
      const itemId =
        item && "id" in item
          ? item.id
          : item && "_id" in item
            ? // fallback if some items use _id
              // @ts-expect-error - some feed items may have _id
              item._id
            : undefined;

      const isAdLoaded = itemId ? loadedAds.current.has(itemId) : false;

      let content: JSX.Element | null = null;

      if (
        item &&
        "type" in item &&
        (item.type === "article" || item.type === "video")
      ) {
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
                gBannerRefs.current[index] = itemRef;
              }}
              tab="latest"
            />
          );
        } else {
          content = <NewsItemAd index={index} item={item} />;
          // content = (
          //   <NewsItemGoogleAds
          //     index={index}
          //     item={item}
          //     ref={(itemRef: NewsItemGoogleAdRef | null) => {
          //       gBannerRefs.current[index] = itemRef;
          //     }}
          //     tab="latest"
          //   />
          // );
        }
      } else if (item && "_type" in item && item._type === "rewardTask") {
        content = <RewardTaskItem item={item} />;
      } else {
        content = null;
      }

      return (
        <Stack gap="$2" px="$3">
          {content}
        </Stack>
      );
    },
    []
  );

  const FooterItem = useCallback(
    () =>
      hasNextPage && isFetching ? (
        <Stack ai="center" jc="center" py="$4">
          <Spinner />
        </Stack>
      ) : null,
    [hasNextPage, isFetching]
  );

  const onViewableItemsChanged = useRef(({ changed }) => {
    for (const item of changed) {
      if (item.item.type === "adCarousel") {
        const cell = mediaRefs?.current[item.index];
        if (!item.isViewable && cell) {
          cell?.pause();
        }
      }

      if (
        (item.item.type === "gAd" || item.item.type === "inHouse") &&
        item.isViewable
      ) {
        const adId = item.item.id;
        if (!adId || loadedAds.current.has(adId)) return;

        const cell = gBannerRefs?.current[item.index];
        if (cell && !cell?.isAdLoaded()) {
          cell?.loadAd();
          loadedAds.current.add(adId);
        }

        // Preload next 2 Google ads ahead (skips in-house ads which have no refs)
        let preloaded = 0;
        for (
          let i = item.index + 1;
          i < gBannerRefs.current.length && preloaded < 2;
          i++
        ) {
          const nextCell = gBannerRefs.current[i];
          if (nextCell && !nextCell.isAdLoaded()) {
            nextCell.loadAd();
            preloaded++;
          }
        }
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
      ref={ref}
      refreshing={isRefetchingByUser}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      suggestEstimatedItemSize
      viewabilityConfig={{
        itemVisiblePercentThreshold: 40,
      }}
    />
  );
});

export default Latest;
