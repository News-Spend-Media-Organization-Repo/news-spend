import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { NewsCategory } from "@news-spend-media/payload/types";
import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Separator } from "heroui-native/separator";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useMMKVObject } from "react-native-mmkv";

import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import NewsItem from "#/components/News/NewsItem";
import {
  CaretRightIcon,
  ClockCounterClockwiseIcon,
  MagnifyingGlassIcon,
  XCircleIcon,
} from "#/lib/icons";
import { orpc, type RouterOutputs } from "#/lib/orpc";
import { useSafeBack } from "#/navigation/useSafeBack";
import {
  addRecentSearch,
  RECENT_SEARCHES_KEY,
  removeRecentSearch,
} from "./recent-searches";
import {
  isSearchableQuery,
  normalizeSearchQuery,
  SEARCH_DEBOUNCE_MS,
} from "./search-query";

type CategoryOption = { id: string; title: string };
type NewsDoc = RouterOutputs["news"]["home"]["docs"][number];

const categoryOptionsOf = (
  categories: NewsCategory["items"]
): CategoryOption[] =>
  (categories ?? []).flatMap(({ category }) => {
    if (!category) {
      return [];
    }
    return typeof category === "string"
      ? [{ id: category, title: category }]
      : [{ id: category.id, title: category.title }];
  });

function SearchHeader({
  query,
  onChangeQuery,
  onSubmit,
  onCancel,
}: {
  query: string;
  onChangeQuery: (query: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <View className="flex-row items-center gap-2 bg-p-500 px-3 pt-safe pb-2">
      <View className="h-[42px] flex-1 flex-row items-center gap-2 rounded-full bg-white px-3">
        <Icon color="#737373" name={MagnifyingGlassIcon} size={18} />
        <TextInput
          accessibilityLabel="Search news"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          className="h-full flex-1 text-base text-gray-900"
          onChangeText={onChangeQuery}
          onSubmitEditing={onSubmit}
          placeholder="Search news"
          placeholderTextColor="#9CA3AF"
          returnKeyType="search"
          value={query}
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityLabel="Clear search"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => onChangeQuery("")}
          >
            <Icon color="#737373" name={XCircleIcon} size={18} />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityLabel="Cancel search"
        accessibilityRole="button"
        className="min-h-10 justify-center"
        hitSlop={8}
        onPress={onCancel}
      >
        <Text className="font-semibold text-base text-white">Cancel</Text>
      </Pressable>
    </View>
  );
}

function CategoryChips({
  categories,
  selected,
  onSelect,
}: {
  categories: CategoryOption[];
  selected: string | undefined;
  onSelect: (category: string | undefined) => void;
}) {
  const chips: Array<{ id: string | undefined; title: string }> = [
    { id: undefined, title: "All" },
    ...categories,
  ];

  return (
    <ScrollView
      contentContainerClassName="gap-2 px-4 py-3"
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
    >
      {chips.map(({ id, title }) => {
        const active = selected === id;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={
              active
                ? "rounded-full bg-p-500 px-4 py-1.5"
                : "rounded-full border border-gray-300 bg-white px-4 py-1.5"
            }
            key={id ?? "all"}
            onPress={() => onSelect(id)}
          >
            <Text
              className={
                active
                  ? "font-semibold text-sm text-white"
                  : "font-semibold text-gray-600 text-sm"
              }
            >
              {title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function RecentSearches({
  recent,
  onSelect,
  onRemove,
  onClear,
}: {
  recent: string[];
  onSelect: (query: string) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
}) {
  if (recent.length === 0) {
    return null;
  }

  return (
    <View className="px-4 pt-4">
      <View className="flex-row items-center justify-between">
        <Text className="font-semibold text-gray-500 text-xs uppercase tracking-wide">
          Recent searches
        </Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onClear}>
          <Text className="font-semibold text-p-500 text-sm">Clear</Text>
        </Pressable>
      </View>
      {recent.map((item) => (
        <View
          className="flex-row items-center gap-3 border-gray-100 border-b py-3"
          key={item}
        >
          <Pressable
            accessibilityLabel={`Search for ${item}`}
            accessibilityRole="button"
            className="flex-1 flex-row items-center gap-3"
            onPress={() => onSelect(item)}
          >
            <Icon color="#737373" name={ClockCounterClockwiseIcon} size={18} />
            <Text className="flex-1 text-base">{item}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Remove ${item} from recent searches`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => onRemove(item)}
          >
            <Icon color="#9CA3AF" name={XCircleIcon} size={18} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function BrowseCategories({
  categories,
  onSelect,
}: {
  categories: CategoryOption[];
  onSelect: (category: CategoryOption) => void;
}) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <View className="px-4 pt-6">
      <Text className="mb-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
        Browse categories
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {categories.map((category) => (
          <Pressable
            accessibilityRole="button"
            className="h-[52px] w-[48%] flex-row items-center justify-between rounded-lg bg-p-500 px-4"
            key={category.id}
            onPress={() => onSelect(category)}
          >
            <Text className="flex-1 font-bold text-white" numberOfLines={1}>
              {category.title}
            </Text>
            <Icon color="#fff" name={CaretRightIcon} size={16} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function SearchScreen() {
  const goBack = useSafeBack();
  const navigation = useNavigation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [recentSearches, setRecentSearches] =
    useMMKVObject<string[]>(RECENT_SEARCHES_KEY);
  const recent = recentSearches ?? [];
  const [categories] = useMMKVObject<NewsCategory["items"]>("CATEGORIES");
  const categoryOptions = useMemo(
    () => categoryOptionsOf(categories),
    [categories]
  );

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQuery(query),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [query]);

  const activeQuery = normalizeSearchQuery(debouncedQuery);
  const searchEnabled = isSearchableQuery(activeQuery);

  const saveRecent = useCallback(
    (value: string) => {
      setRecentSearches(addRecentSearch(recent, value));
    },
    [recent, setRecentSearches]
  );

  const queryOptions = orpc.news.search.infiniteOptions({
    input: (pageParam: number | undefined) => ({
      q: activeQuery,
      category,
      limit: 20,
      page: pageParam ?? 1,
    }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.nextPage ?? undefined,
    enabled: searchEnabled,
  });

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    refetch,
  } = useInfiniteQuery(queryOptions);

  const docs = useMemo(
    () => (data?.pages.flatMap((page) => page.docs) ?? []) as NewsDoc[],
    [data]
  );
  const totalDocs = data?.pages[0]?.totalDocs ?? 0;

  const onSubmit = () => {
    if (isSearchableQuery(query)) {
      saveRecent(query);
      Keyboard.dismiss();
    }
  };

  const onSelectCategory = (selected: string | undefined) => {
    setCategory(selected);
  };

  // A tile opens that category's tab on Home. Searching titles for the
  // category's own name would miss almost every article in it.
  const onBrowseCategory = (option: CategoryOption) => {
    navigation.navigate("NewsHome", { category: option.id });
  };

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<NewsDoc>) => (
      <View className="px-4 py-2">
        <NewsItem latest news={item} onOpen={() => saveRecent(activeQuery)} />
      </View>
    ),
    [activeQuery, saveRecent]
  );

  return (
    <View className="flex-1 bg-white">
      <SearchHeader
        onCancel={goBack}
        onChangeQuery={setQuery}
        onSubmit={onSubmit}
        query={query}
      />

      {searchEnabled ? (
        <View className="flex-1">
          <CategoryChips
            categories={categoryOptions}
            onSelect={onSelectCategory}
            selected={category}
          />

          {error ? (
            <View className="flex-1 items-center justify-center gap-3 px-6">
              <Text className="text-center font-semibold text-base">
                Search isn&apos;t working right now
              </Text>
              <Pressable
                accessibilityRole="button"
                className="rounded-full bg-p-500 px-5 py-2"
                onPress={() => refetch()}
              >
                <Text className="font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          ) : isPending ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : (
            <>
              <Text className="px-4 pb-1 text-gray-500 text-sm">{`${totalDocs} results for “${activeQuery}”`}</Text>
              <LegendList
                contentContainerStyle={{ paddingBottom: 24 }}
                data={docs}
                ItemSeparatorComponent={Separator}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                  <View className="items-center gap-1 px-6 pt-12">
                    <Text className="text-center font-semibold text-base">
                      {`No results for “${activeQuery}”`}
                    </Text>
                    <Text className="text-center text-gray-500 text-sm">
                      Try a different word.
                    </Text>
                  </View>
                }
                onEndReached={onEndReached}
                onEndReachedThreshold={0.5}
                renderItem={renderItem}
                showsVerticalScrollIndicator={false}
              />
            </>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="pb-6"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <RecentSearches
            onClear={() => setRecentSearches([])}
            onRemove={(item) =>
              setRecentSearches(removeRecentSearch(recent, item))
            }
            onSelect={(item) => {
              setQuery(item);
              saveRecent(item);
            }}
            recent={recent}
          />
          <BrowseCategories
            categories={categoryOptions}
            onSelect={onBrowseCategory}
          />
        </ScrollView>
      )}
    </View>
  );
}
