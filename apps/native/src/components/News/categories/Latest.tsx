import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { PartnerContent } from "@news-spend-media/payload/types";
import { useScrollToTop } from "@react-navigation/native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Separator } from "heroui-native/separator";
import { Spinner } from "heroui-native/spinner";
import type { JSX, RefObject } from "react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Dimensions, View } from "react-native";
import { subscribeKey } from "valtio/utils";
import type { AdCarouselRef } from "#/components/Ads/AdCarousel";
import AdCarousel from "#/components/Ads/AdCarousel";
import NewsItemAd from "#/components/Ads/NewsItemAd";
import NewsItemGoogleAds from "#/components/Ads/NewsItemGoogleAd";
import {
  NEWS_FEED_REFETCH_INTERVAL_MS,
  NEWS_FEED_STALE_TIME_MS,
} from "#/hooks/news/constants";
import { homeFeedInfiniteKey, homeFeedInput } from "#/hooks/news/feedKeys";
import { relatedArticlesSeenOnArrival } from "#/hooks/news/relatedImpressions";
import type { ImpressionToken } from "#/hooks/news/useImpressionViewability";
import { useNewsAnalytics } from "#/hooks/news/useNewsAnalytics";
import { usePartnerImpressionViewability } from "#/hooks/news/usePartnerImpressionViewability";
import { useRefetchOnReturn } from "#/hooks/news/useRefetchOnReturn";
import { useMarkInteractive } from "#/hooks/useMarkInteractive";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc, type RouterOutputs } from "#/lib/orpc";
import { queryClient } from "#/lib/tanstackQuery";
import { routeState, useTabBarHeight } from "#/state/route-state";
import { markTabAdsStale, registerAdSlots } from "#/utils/ad-cache";
import { preloadAdsAhead } from "#/utils/ad-preload";
import HomeListHeader from "../HomeListHeader";
import HomeListSkeleton from "../HomeListSkeleton";
import NewsItem from "../NewsItem";
import RelatedNews from "../RelatedNews";
import { buildLatestViewabilityPairs } from "./feedViewability";

type ItemType = RouterOutputs["news"]["home"]["docs"][number];

// Stable empty fallbacks. Inline `?? []` would mint a new identity every
// render and defeat MemoizedListHeader's memo.
const EMPTY_DOCS: RouterOutputs["news"]["home"]["docs"] = [];
const EMPTY_BOOKS: PartnerContent[] = [];

/** Rotation belongs to pull-to-refresh, not to the app regaining focus. */
const TRENDING_BOOKS_STALE_TIME_MS = 5 * 60 * 1000;

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

const MemoizedSeparator = memo(() => <Separator className="m-3" />);

const Latest = memo(
  ({
    isActiveTab,
    ref,
  }: {
    isActiveTab: boolean;
    ref: RefObject<LegendListRef>;
  }) => {
    const mediaRefs = useRef<(AdCarouselRef | null)[]>([]);

    // `renderItem` is a plain callback handed to LegendList, not a component —
    // React Compiler's auto-memoization only reaches components and hooks, so
    // an inline ref callback written directly in renderItem gets a fresh
    // identity on every invocation, forcing React to detach/reattach the ref
    // on every re-render of that row instead of only on mount. These caches
    // keep one stable function per key across the list's lifetime.
    const mediaRefCallbacks = useRef<
      Map<number, (itemRef: AdCarouselRef | null) => void>
    >(new Map());
    const getMediaRefCallback = useCallback((index: number) => {
      let cb = mediaRefCallbacks.current.get(index);
      if (!cb) {
        cb = (itemRef) => {
          mediaRefs.current[index] = itemRef;
        };
        mediaRefCallbacks.current.set(index, cb);
      }
      return cb;
    }, []);

    const tabBarHeight = useTabBarHeight();
    const { trackImpression } = useNewsAnalytics();
    const trackImpressionRef = useRef(trackImpression);
    useEffect(() => {
      trackImpressionRef.current = trackImpression;
    }, [trackImpression]);

    // Stable ref to feed data for use inside onViewableItemsChanged without
    // needing to re-create the callback on every render.
    const flattenedNewsRef = useRef<
      RouterOutputs["news"]["home"]["docs"] | undefined
    >(undefined);
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

    // Read at request time by `input` below, so only the specific fetch
    // triggered by pull-to-refresh carries it — passive refetches (tab
    // switch, app foreground, article-back) still hit the server's 90s
    // composed-feed cache instead of forcing a fresh ad on every return.
    const forceRefreshRef = useRef(false);

    const {
      data: news,
      dataUpdatedAt,
      fetchNextPage,
      hasNextPage,
      isFetching,
      isPending,
      refetch,
    } = useInfiniteQuery(
      orpc.news.home.infiniteOptions({
        input: (pageParam: number | undefined) =>
          homeFeedInput(pageParam, forceRefreshRef.current),
        getNextPageParam: (lastPage) => lastPage?.nextPage,
        initialPageParam: undefined,
        staleTime: NEWS_FEED_STALE_TIME_MS,
        gcTime: 10 * 60 * 1000, // 10 min, keeps cached data in memory
        // Poll while the home feed is on screen. Without this the only
        // refresh triggers were app foreground and returning to the tab, so a
        // reader watching the screen never saw a newly published story land.
        refetchInterval: NEWS_FEED_REFETCH_INTERVAL_MS,
      })
    );

    const refetchFresh = useCallback(async () => {
      forceRefreshRef.current = true;
      try {
        await refetch();
      } finally {
        forceRefreshRef.current = false;
      }
    }, [refetch]);

    const partnerContent = useQuery({
      ...orpc.partnerContent.random.queryOptions({
        input: {
          placement: ["homepage-trending-books"],
          limit: 12,
        },
        /**
         * Without a stale time, every background/foreground cycle marked the
         * query stale and fetched a new random batch, so the row visibly
         * reshuffled each time the reader came back. See CustomBannerAd: the
         * creative should only rotate on a new mount or a deliberate refresh.
         */
        staleTime: TRENDING_BOOKS_STALE_TIME_MS,
      }),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });

    const flattenedPartnerContent = partnerContent?.data;

    const trendingNews = useQuery(
      orpc.news.trending.queryOptions({ input: { limit: 3 } })
    );

    // Articles already shown in the trending carousel shouldn't also appear
    // further down in the Latest list.
    const trendingIds = useMemo(
      () => new Set(trendingNews.data?.map((item) => item.id)),
      [trendingNews.data]
    );

    const flattenedNews = useMemo(() => {
      const docs = news?.pages.flatMap((page) => page.docs);
      if (!docs || trendingIds.size === 0) {
        return docs;
      }
      return docs.filter(
        (item) =>
          !(
            item &&
            "type" in item &&
            (item.type === "article" || item.type === "video") &&
            trendingIds.has(item.id)
          )
      );
    }, [news, trendingIds]);
    flattenedNewsRef.current = flattenedNews;

    // Tell the ad cache which ids are this feed's ad slots, in order, so a
    // rebuilt feed (new random ids) finds the ads it already loaded. Done in
    // render, before any slot mounts, because the slots read the cache as they
    // render; registering is idempotent.
    useMemo(() => {
      registerAdSlots(
        "latest",
        (flattenedNews ?? []).flatMap((item) =>
          item &&
          "_type" in item &&
          item._type === "ad" &&
          "type" in item &&
          item.type === "gAd" &&
          "id" in item &&
          item.id
            ? [item.id]
            : []
        )
      );
    }, [flattenedNews]);

    // Eagerly preload every gAd slot already loaded into the feed, as soon
    // as its page arrives — independent of scroll position or whether that
    // row has even mounted yet. Matches Google's own guidance for ad
    // preloading in a list (a pool populated ahead of need, not tied to
    // visibility): a viewability-driven "preload the next 2 ahead" walk can
    // only ever reach a slot that has already mounted (its ref exists),
    // which for a virtualized list is rarely more than one screen away —
    // in practice that made ads start loading only once scrolled into
    // view. ensureNativeAdLoaded is cache/in-flight-aware, so calling it
    // repeatedly for ids already loaded or in progress is a cheap no-op.
    const lastVisibleIndexRef = useRef(0);
    useEffect(() => {
      preloadAdsAhead("latest", flattenedNews, lastVisibleIndexRef.current);
    }, [flattenedNews]);

    // Pull-to-refresh is a deliberate user action, unlike the passive
    // refetches below — it always bypasses the server's composed-feed cache
    // and gets a genuinely fresh ad, not just whatever the last 90s window
    // happened to cache.
    const { isRefetchingByUser, refetchByUser } =
      useRefreshByUser(refetchFresh);
    const trendingRefetch = useRefreshByUser(trendingNews.refetch);

    // Fresh news on return — back from an article, bottom-tab switch, or
    // switching back to this category tab — but only once the 5min staleTime
    // has actually elapsed, so flicking between tabs stays cheap. A forced
    // refetch updates loaded pages in place — no scroll jump, unlike the
    // pull-to-refresh pagination reset below.
    useRefetchOnReturn({
      dataUpdatedAt,
      isActiveTab,
      refetch,
      staleTime: NEWS_FEED_STALE_TIME_MS,
    });

    // #region Callbacks
    const resetInfiniteQueryPagination = useCallback(() => {
      const qKey = homeFeedInfiniteKey();

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
      (item: RouterOutputs["news"]["home"]["docs"][0], index: number) =>
        // Never fall back to a shared constant key; with recycleItems, duplicate
        // keys make recycled cells bleed state between items.
        item?.id ?? `${item && "_type" in item ? item._type : "item"}-${index}`,
      []
    );

    const handleRefresh = useCallback(() => {
      resetInfiniteQueryPagination();
      refetchByUser();
      trendingRefetch.refetchByUser();
      // Books and ads re-roll together with the rest of the feed.
      partnerContent.refetch();
      markTabAdsStale("latest");
      lastVisibleIndexRef.current = 0;
    }, [
      resetInfiniteQueryPagination,
      refetchByUser,
      trendingRefetch.refetchByUser,
      partnerContent.refetch,
    ]);

    const onEndReached = useCallback(() => {
      if (hasNextPage && !isFetching) {
        fetchNextPage();
      }
    }, [hasNextPage, isFetching, fetchNextPage]);

    /**
     * Rough heights per row type, in px.
     *
     * The feed mixes article rows, full-width ad carousels, Google banners and
     * reward cards, whose heights differ by several multiples. Without an
     * estimate LegendList guesses one size for all of them, which is what
     * produces the scroll-position jumps and blank frames during a fast scroll.
     * These do not need to be exact — they need to be in the right range.
     */
    const getEstimatedItemSize = useCallback(
      (_index: number, item: ItemType) => {
        const type = item && "type" in item ? item.type : undefined;
        const kind = item && "_type" in item ? item._type : undefined;

        if (type === "adCarousel") {
          return 260;
        }
        if (type === "gAd") {
          // The media view alone is 122, plus the AdChoices gutter and insets
          // (MIN_AD_HEIGHT in NewsItemGoogleAd). Estimating this as a 116px
          // article row made the list re-flow every time an ad measured.
          return 150;
        }
        if (kind === "relatedNews") {
          return 220;
        }
        // Article and video rows: a 100px thumbnail plus padding.
        return 116;
      },
      []
    );

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
        let content: JSX.Element | null = null;

        if (
          item &&
          "type" in item &&
          (item.type === "article" || item.type === "video")
        ) {
          content = <NewsItem latest news={item} />;
        } else if (item && "_type" in item && item._type === "relatedNews") {
          content = (
            <RelatedNews news={"data" in item ? item.data : undefined} />
          );
        } else if (item && "type" in item && item.type === "adCarousel") {
          content = (
            <AdCarousel
              item={"payload" in item ? item.payload : undefined}
              listRef={getMediaRefCallback(index)}
            />
          );
        } else if (item && "_type" in item && item._type === "ad") {
          if ("type" in item && item.type === "gAd") {
            content = (
              <NewsItemGoogleAds index={index} item={item} tab="latest" />
            );
          } else {
            content = <NewsItemAd index={index} item={item} />;
          }
        } else {
          content = null;
        }

        return <View className="px-3">{content}</View>;
      },
      [getMediaRefCallback]
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

    const onViewableItemsChanged = useRef(({ changed }) => {
      // Ads are requested a bounded distance ahead of what is on screen.
      for (const item of changed) {
        if (item.isViewable && item.index > lastVisibleIndexRef.current) {
          lastVisibleIndexRef.current = item.index;
        }
      }
      preloadAdsAhead(
        "latest",
        flattenedNewsRef.current,
        lastVisibleIndexRef.current
      );
      for (const item of changed) {
        if (item.item.type === "adCarousel") {
          const cell = mediaRefs?.current[item.index];
          if (!item.isViewable && cell) {
            cell?.pause();
          }
        }
      }
    });

    // Paired with IMPRESSION_VIEWABILITY_CONFIG, so `isViewable` here already
    // means 50%-for-a-second rather than merely on screen.
    const onImpressionItemsChanged = useRef(
      ({ changed }: { changed: ImpressionToken[] }) => {
        for (const item of changed) {
          if (!(item.isViewable && item.item)) {
            continue;
          }

          if (
            "type" in item.item &&
            (item.item.type === "article" || item.item.type === "video") &&
            item.item.id
          ) {
            trackImpressionRef.current(
              { id: item.item.id, slug: item.item.slug },
              item.index,
              "HomeFeed"
            );
          } else if (item.item._type === "relatedNews") {
            // Counted here, off the row's own visibility, rather than from the
            // horizontal list inside it. See relatedArticlesSeenOnArrival.
            for (const card of relatedArticlesSeenOnArrival(
              item.item.data,
              Dimensions.get("window").width
            )) {
              trackImpressionRef.current(
                { id: card.id, slug: card.slug },
                card.position,
                "HomeRelated"
              );
            }
          }
        }
      }
    );

    const partnerImpressionPairs = usePartnerImpressionViewability();

    const viewabilityConfigCallbackPairs = useRef(
      buildLatestViewabilityPairs(
        onViewableItemsChanged.current,
        onImpressionItemsChanged.current,
        partnerImpressionPairs
      )
    );
    // #endregion
    useScrollToTop(ref);

    // Emits nav_tti for /Tab/Home/NewsHome once the feed has rendered.
    useMarkInteractive(!isPending);

    // Only the main feed gates first paint. The header-only queries (video
    // news, partner books, trending) stream into their sections when ready.
    if (isPending) {
      return <HomeListSkeleton />;
    }

    return (
      <LegendList
        contentContainerStyle={{
          paddingBottom: tabBarHeight + 20,
          paddingTop: 15,
        }}
        data={flattenedNews}
        getEstimatedItemSize={getEstimatedItemSize}
        getItemType={getItemType}
        ItemSeparatorComponent={MemoizedSeparator}
        keyExtractor={keyExtractor}
        ListFooterComponent={FooterItem}
        ListHeaderComponent={
          <MemoizedListHeader
            books={flattenedPartnerContent ?? EMPTY_BOOKS}
            news={trendingNews.data ?? EMPTY_DOCS}
            /**
             * Always empty: Special Coverage is video news, and video is
             * switched off server-side — the News collection offers only
             * "article" and its beforeValidate hook refuses anything else, so
             * the `useAllNews({ type: "video" })` that used to feed this could
             * only ever return zero rows. It was an infinite query firing on
             * every mount of the home feed for a section that renders `null`
             * when empty. Switch video back on in the News collection and
             * restore that hook to bring the section back.
             */
            specialCoverage={EMPTY_DOCS}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onRefresh={handleRefresh}
        recycleItems
        ref={ref}
        refreshing={isRefetchingByUser}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        // suggestEstimatedItemSize
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
      />
    );
  }
);

export default Latest;
