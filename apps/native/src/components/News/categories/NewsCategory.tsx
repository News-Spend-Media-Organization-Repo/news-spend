import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import type { News } from "@news-spend-media/payload/types";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { memo, useCallback, useRef } from "react";
import { Separator, Spinner, Stack } from "tamagui";

import NewsItemAds from "#/components/Ads/NewsItemAd";
import NewsItemGoogleAds, {
  type NewsItemGoogleAdRef,
} from "#/components/Ads/NewsItemGoogleAd";
import { useAllNews } from "#/hooks/news";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { clearTabAdCache } from "#/utils/ad-cache";

import NewsItem from "../NewsItem";
import NewsItemPlaceholder from "../NewsItemPlaceholder";

const MemoizedSeparator = memo(() => <Separator boc="#d7d7d7" my="$3" />);

const NewsCategory = ({
  route,
  ref,
}: {
  route: string;
  ref?: LegendListRef<News>;
}) => {
  const tabBarHeight = useBottomTabBarHeight();
  const gBannerRefs = useRef<NewsItemGoogleAdRef[]>([]);
  const loadedAds = useRef<Set<string>>(new Set());
  const { data, isPending, refetch, fetchNextPage, isFetching, hasNextPage } =
    useAllNews({
      category: route,
      ad: true,
    });

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(() => {
    refetch();
    clearTabAdCache(route);
  });

  const renderItem = useCallback(({ item, index }) => {
    if (item._type === "ad") {
      if (item.type === "gAd") {
        const isAdLoaded = loadedAds.current.has(item._id);
        return (
          <NewsItemGoogleAds
            index={index}
            isAdLoaded={isAdLoaded}
            item={item}
            loadOnMount={false}
            ref={(itemRef) => {
              gBannerRefs.current[index] = itemRef;
            }}
            tab={route}
          />
        );
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
  }, []);

  const FooterItem = useCallback(
    () =>
      hasNextPage && isFetching ? (
        <Stack ai="center" jc="center" py="$4">
          <Spinner />
        </Stack>
      ) : null,
    [hasNextPage, isFetching]
  );

  const onLoadListener = useCallback(({ elapsedTimeInMs }) => {
    console.log("Sample List load time", elapsedTimeInMs);
  }, []);

  const onViewableItemsChanged = useRef(({ changed }) => {
    for (const changedItem of changed) {
      const { item, isViewable, index } = changedItem;
      if (item?.type === "gAd" && isViewable) {
        const cell = gBannerRefs.current[index];
        if (cell && !loadedAds.current.has(item._id) && !cell.isAdLoaded()) {
          cell.loadAd();
          loadedAds.current.add(item._id);
        }
      }
    }
  });

  const onEndReached = () => {
    if (hasNextPage && !isFetching) {
      fetchNextPage();
    }
  };

  const keyExtractor = useCallback((item) => item._id ?? item.id, []);
  const flattenedNews = data?.pages.flatMap((page) => page.docs);

  if (isPending) {
    return <NewsItemPlaceholder show />;
  }

  return (
    <LegendList
      contentContainerStyle={{
        paddingBottom: tabBarHeight / 2,
        paddingTop: 15,
        paddingHorizontal: 10,
      }}
      data={flattenedNews}
      // estimatedItemSize={120}
      getItemType={(item) => item?.type ?? item?._type}
      ItemSeparatorComponent={MemoizedSeparator}
      keyExtractor={keyExtractor}
      ListFooterComponent={FooterItem}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      onRefresh={refetchByUser}
      onViewableItemsChanged={onViewableItemsChanged.current}
      ref={ref}
      refreshing={isRefetchingByUser}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      suggestEstimatedItemSize
      viewabilityConfig={{
        itemVisiblePercentThreshold: 60,
      }}
      // onLoad={onLoadListener}
    />
    // </Stack>
  );
};

export default memo(NewsCategory);
