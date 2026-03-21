import { LegendList } from "@legendapp/list/react-native";
import type { Partner } from "@news-spend-media/payload/types";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Paragraph,
  Separator,
  SizableText,
  Spinner,
  Stack,
  Tabs,
} from "tamagui";

import { Screen } from "#/components/Screen";
import { tokens } from "#/constants/tokens";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";
import { useFavoriteStores } from "#/state/favoriteStoreState";

import ShopItem from "../components/ShopItem";

function ShopHome() {
  const [activeTab, setActiveTab] = useState("allStores");
  const { stores: favorites } = useFavoriteStores();

  const {
    data: allStoresData,
    isPending: allStoresPending,
    isLoading: allStoresLoading,
    refetch: refetchAllStores,
    fetchNextPage: fetchNextAllStores,
    hasNextPage: hasNextAllStores,
  } = useInfiniteQuery(
    orpc.store.all.infiniteOptions({
      input: (pageParam: number | undefined) => ({
        page: pageParam,
        limit: 12,
        sortBy: "newest",
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextPage,
    })
  );

  const {
    data: popularStores,
    isPending: popularPending,
    refetch: refetchPopular,
  } = useQuery({
    ...orpc.store.popular.queryOptions({
      input: {
        limit: 12,
      },
    }),
    enabled: activeTab === "popular",
  });

  const { refetchByUser, isRefetchingByUser } = useRefreshByUser(() => {
    if (activeTab === "allStores") {
      refetchAllStores();
    } else if (activeTab === "popular") {
      refetchPopular();
    }
  });

  const allStores = allStoresData?.pages.flatMap((page) => page.docs) ?? [];

  return (
    <Screen gap="$4">
      <Tabs
        defaultValue="allStores"
        flexDirection="column"
        mx="$2"
        onValueChange={setActiveTab}
        overflow="hidden"
        pt="$4"
        value={activeTab}
      >
        <Tabs.List
          borderColor="$borderColor"
          borderRadius="$4"
          borderWidth="$0.25"
          disablePassBorderRadius
          overflow="hidden"
        >
          <Tabs.Tab
            borderRadius={0}
            flex={1}
            style={{
              backgroundColor:
                activeTab === "allStores"
                  ? tokens.color.p400.val
                  : "transparent",
            }}
            value="allStores"
          >
            <SizableText
              {...(activeTab === "allStores" && { color: "$background" })}
            >
              All Stores
            </SizableText>
          </Tabs.Tab>
          <Separator vertical />
          <Tabs.Tab
            borderRadius={0}
            flex={1}
            style={{
              backgroundColor:
                activeTab === "popular" ? tokens.color.p400.val : "transparent",
            }}
            value="popular"
          >
            <SizableText
              {...(activeTab === "popular" && { color: "$background" })}
            >
              Popular
            </SizableText>
          </Tabs.Tab>
          <Separator vertical />
          <Tabs.Tab
            borderRadius={0}
            flex={1}
            style={{
              backgroundColor:
                activeTab === "favorites"
                  ? tokens.color.p400.val
                  : "transparent",
            }}
            value="favorites"
          >
            <SizableText
              {...(activeTab === "favorites" && { color: "$background" })}
            >
              Favorites
            </SizableText>
          </Tabs.Tab>
        </Tabs.List>
        <Paragraph py="$2">
          Earn credit while shopping at your favorite store
        </Paragraph>

        <Tabs.Content mb="$7" value="allStores">
          <LegendList
            contentContainerStyle={{
              paddingBottom: 300,
            }}
            data={allStores}
            ItemSeparatorComponent={() => <Stack h={40} />}
            keyExtractor={(item) => item?.id}
            ListEmptyComponent={
              allStoresPending || allStoresLoading ? <Spinner /> : null
            }
            onEndReached={() => {
              if (hasNextAllStores) {
                fetchNextAllStores();
              }
            }}
            onRefresh={refetchByUser}
            refreshing={isRefetchingByUser}
            renderItem={({ item }) => <ShopItem item={item} />}
            showsVerticalScrollIndicator={false}
          />
        </Tabs.Content>
        <Tabs.Content value="popular">
          <LegendList
            contentContainerStyle={{
              paddingBottom: 250,
            }}
            data={popularStores ?? []}
            ItemSeparatorComponent={() => <Stack h={40} />}
            keyExtractor={(item) => item?.id}
            ListEmptyComponent={popularPending ? <Spinner /> : null}
            onRefresh={refetchByUser}
            refreshing={isRefetchingByUser}
            renderItem={({ item }) => <ShopItem item={item} />}
            showsVerticalScrollIndicator={false}
          />
        </Tabs.Content>
        <Tabs.Content value="favorites">
          <LegendList
            contentContainerStyle={{
              paddingBottom: 250,
            }}
            data={favorites}
            ItemSeparatorComponent={() => <Stack h={40} />}
            keyExtractor={(item) => item?.id!}
            renderItem={({ item }) => (
              <ShopItem item={item as Readonly<Partner>} />
            )}
            showsVerticalScrollIndicator={false}
          />
        </Tabs.Content>
      </Tabs>
    </Screen>
  );
}

export default ShopHome;
