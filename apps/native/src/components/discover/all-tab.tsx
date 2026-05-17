import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import type { PartnerContent } from "@news-spend-media/payload/types";
import { useIsFocused } from "@react-navigation/native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { ActivityIndicator } from "@tamagui/lucide-icons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { Station } from "radio-browser-api";
import { useCallback, useMemo } from "react";
import type { ScrollViewProps } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Card, H4, Paragraph, Spinner, Stack, XStack } from "tamagui";
import { useSnapshot } from "valtio";

import { Button, Image, Text } from "#/components/ui";
import { usePartnerClick } from "#/hooks/usePartnerClick";
import { orpc } from "#/lib/orpc";
import { navigationRef } from "#/navigation/navigationUtils";
import { authState } from "#/state/auth";
import { getImageData } from "#/utils/getImageData";

import { StationItem } from "./RadioStationItem";

type Section = {
  type: "header" | "app" | "music" | "game" | "book" | "survey";
  data: any;
  handleClick?: (item: PartnerContent) => void;
  isLoading?: (itemId: string) => boolean;
};

export const AllTab = () => {
  const { user } = useSnapshot(authState);

  const isFocused = useIsFocused();

  const { handleClick, isLoading } = usePartnerClick();

  const { data: appData, isPending: isAppPending } = useInfiniteQuery(
    orpc.partnerContent.filtered.infiniteOptions({
      input: (pageParam: number | undefined) => ({
        limit: 5,
        page: pageParam,
        type: ["app"],
        placement: ["points-mall-apps"],
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextPage,
    }),
  );

  const { data: bookData, isPending: isBookPending } = useInfiniteQuery(
    orpc.partnerContent.filtered.infiniteOptions({
      input: (pageParam: number | undefined) => ({
        limit: 5,
        type: ["book"],
        placement: ["points-mall-books"],
        page: pageParam,
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextPage,
    }),
  );

  const surveyQuery = useQuery(
    orpc.survey.cpx.getSurveys.queryOptions({
      refetchInterval: user && isFocused ? 120 * 1000 : undefined,
      meta: { persist: false },
      select: (data) =>
        Array.isArray(data)
          ? [...data].sort((a, b) => Number(b.payout ?? 0) - Number(a.payout ?? 0))
          : data,
    }),
  );

  const appsDataList = useMemo(() => appData?.pages[0].docs || [], [appData]);

  const booksDataList = useMemo(() => bookData?.pages[0].docs || [], [bookData]);

  // Game data fetching
  const { data: gameList, isPending: isGamePending } = useQuery({
    queryKey: ["games", "all-tab"],
    queryFn: async () => {
      const res = await (
        await fetch("https://feeds.gamepix.com/v2/json?sid=SW281&pagination=12&page=1")
      ).json();
      return res.items;
    },
    staleTime: Number.POSITIVE_INFINITY,
    select: (data) =>
      data?.slice(0, 6)?.map((item) => ({
        ...item,
        type: "game",
      })),
  });

  const { data: musicData, isPending: isMusicPending } = useQuery(
    orpc.radioStation.top.queryOptions({
      input: { limit: 6 },
      staleTime: 5 * 60 * 1000,
      select: (data) =>
        data?.map((item) => ({
          ...item,
          type: "music",
        })),
    }),
  );

  const sections: Section[] = [
    { type: "header", data: "Apps" },
    ...(appsDataList?.map((item) => ({
      type: "app",
      data: item,
      handleClick,
      isLoading,
    })) || []),
    { type: "header", data: "Music" },
    { type: "music", data: musicData },
    { type: "header", data: "Games" },
    ...(gameList?.map((item) => ({ type: "game", data: item })) ?? []),
    { type: "header", data: "Books" },
    { type: "book", data: booksDataList, handleClick, isLoading },
    { type: "header", data: "Surveys" },
    { type: "survey", data: surveyQuery?.data ?? [] },
  ];

  const renderItem: ListRenderItem<Section> = ({ item }) => {
    switch (item.type) {
      case "header":
        return (
          <H4 bg="white" px="$3" py="$2">
            {item.data}
          </H4>
        );

      case "app":
        return (
          <AppItem handleClick={item.handleClick} isLoading={item.isLoading} item={item.data} />
        );

      case "music":
        return <MusicSection itemList={item.data} />;

      case "game":
        return <GameItem item={item.data} />;

      case "book":
        return (
          <BooksSection
            data={item.data}
            handleClick={item.handleClick}
            isLoading={item.isLoading}
          />
        );

      case "survey":
        return <SurveysSection data={item.data} />;

      default:
        return null;
    }
  };

  const stickyHeaderIndices = useMemo(
    () =>
      sections
        ?.map((item, index) => {
          if (item.type === "header") {
            return index;
          }
          return null;
        })
        .filter((item) => item !== null),
    [sections],
  );

  if (isGamePending || isAppPending || isMusicPending || surveyQuery.isPending || isBookPending) {
    return (
      <Stack ai="center" flex={1} jc="center">
        <Spinner size="large" />
      </Stack>
    );
  }

  return (
    <FlashList
      contentContainerStyle={{ paddingVertical: 12 }}
      data={sections}
      getItemType={(item) => (item.type === "header" ? "sectionHeader" : "row")}
      keyExtractor={(item, index) =>
        item.type === "header" ? `header-${item.data}` : (item.data?.id ?? `${item.type}-${index}`)
      }
      renderItem={renderItem}
      stickyHeaderIndices={stickyHeaderIndices}
    />
  );
};

// Extract components for each section type
const AppItem = ({
  item,
  handleClick,
  isLoading,
}: {
  item: PartnerContent;
  handleClick?: (item: PartnerContent) => void;
  isLoading?: (itemId: string) => boolean;
}) => {
  const { blurhash, url } = getImageData(item.media);
  const loading = isLoading?.(item.id);

  return (
    <XStack
      ai="flex-start"
      gap="$2.5"
      onPress={() => handleClick?.(item)}
      opacity={loading ? 0.7 : 1}
      px="$3"
      py="$2"
    >
      <Image
        br="$3"
        height={80}
        placeholder={{ blurhash }}
        source={{ uri: url ?? "" }}
        width={80}
      />
      <Stack flex={1} h="100%" jc="space-between">
        <Stack>
          <XStack ai="center" gap="$2">
            <Paragraph flex={1} fos="$5" numberOfLines={2}>
              {item.title}
            </Paragraph>
            {loading ? <ActivityIndicator color="#666" size="small" /> : null}
          </XStack>
          <Text color="$gray.50" fos="$4" numberOfLines={2}>
            {item.condition}
          </Text>
        </Stack>
        <Stack als="flex-end" bg="$color.s300" br="$10" fd="row" h="auto" px="$2" py="$1">
          <Text color="white" fos="$3">
            {item.points} points
          </Text>
        </Stack>
      </Stack>
    </XStack>
  );
};

const CustomScrollView = (props: ScrollViewProps) => <ScrollView {...props} />;

const MusicSection = ({ itemList }: { itemList: Station[] }) => {
  const renderStationItem = useCallback(
    ({ item }: LegendListRenderItemProps<Station>) => (
      <StationItem item={item} stationList={itemList} />
    ),
    [itemList],
  );

  return (
    <LegendList
      contentContainerStyle={{
        paddingLeft: 16,
        paddingRight: 8,
      }}
      data={itemList}
      estimatedItemSize={200}
      horizontal
      ItemSeparatorComponent={() => <Stack w={16} />}
      keyExtractor={(item) => item.id}
      recycleItems
      renderItem={renderStationItem}
      renderScrollComponent={CustomScrollView}
      showsHorizontalScrollIndicator={false}
      style={{ height: 200 }}
    />
  );
};

const onItemClick = (gameUrl?: string, title?: string) => {
  const { user } = authState;
  if (!user || user.isAnonymous) {
    navigationRef.navigate("SignIn", { redirect: "SurveyTab" });
    return;
  }

  if (gameUrl) {
    navigationRef.navigate("SurveyWebView" as any, { url: gameUrl, type: "game", title });
  }
};

const GameItem = ({ item }) => (
  <XStack
    ai="flex-start"
    gap="$2.5"
    onPress={() => onItemClick(item.url, item.title)}
    px="$3"
    py="$2"
  >
    <Image br="$3" height={80} source={{ uri: item.image }} width={80} />
    <Stack flex={1} jc="space-between">
      <Stack>
        <Text fos="$5" fow="600" numberOfLines={2}>
          {item.title}
        </Text>
        <Text color="$gray.50" fos="$4" numberOfLines={2}>
          {item.description}
        </Text>
      </Stack>
    </Stack>
  </XStack>
);

export const BookItem = ({
  item,
  handleClick,
  isLoading,
}: {
  item: PartnerContent;
  handleClick?: (item: PartnerContent) => void;
  isLoading?: (itemId: string) => boolean;
}) => {
  const { url } = getImageData(item.media);
  const loading = isLoading?.(item.id);

  return (
    <Stack
      br="$2"
      mb="$2"
      mr="$4"
      onPress={() => handleClick?.(item)}
      opacity={loading ? 0.7 : 1}
      ov="hidden"
      w={130}
    >
      <Image
        cachePolicy="memory-disk"
        contentFit="cover"
        minHeight={180}
        source={{ uri: url || "" }}
        w="100%"
      />
      <XStack ai="center" gap="$2" mt="$2">
        <Text color="$gray.50" flex={1} fontStyle="italic" fos="$4" fow="600" numberOfLines={2}>
          {item.condition}
        </Text>
        {loading ? <ActivityIndicator color="#666" size="small" /> : null}
      </XStack>
    </Stack>
  );
};

const BooksSection = ({
  data,
  handleClick,
  isLoading,
}: {
  data: PartnerContent[];
  handleClick?: (item: PartnerContent) => void;
  isLoading?: (itemId: string) => boolean;
}) => (
  <Stack h={250} px="$3">
    <LegendList
      data={data}
      estimatedItemSize={200}
      horizontal
      renderItem={({ item }) => (
        <BookItem handleClick={handleClick} isLoading={isLoading} item={item} />
      )}
      renderScrollComponent={CustomScrollView}
      showsHorizontalScrollIndicator={false}
    />
  </Stack>
);

const handleStartSurvey = (surveyUrl?: string) => {
  const { user } = authState;
  if (!user || user.isAnonymous || surveyUrl === "login-required") {
    navigationRef.navigate("SignIn", { redirect: "SurveyTab" });
    return;
  }

  if (surveyUrl) {
    navigationRef.navigate("SurveyWebView" as any, { url: surveyUrl });
  }
};

const SurveysSection = ({ data }) => (
  <Stack fd="row" flexWrap="wrap" gap="$2" jc="space-between" px="$3">
    {data?.map((item, index) => (
      <Card br="$3" elevate gap="$4" key={`survey-${index}`} p="$3" w="48%">
        <Card.Header p="$0">
          <H4>{Math.floor(item.payout)} Points</H4>
          <Text fow="$1">{item.loi} min</Text>
        </Card.Header>
        <Card.Footer>
          <Button onPress={() => handleStartSurvey(item.href)}>
            <Button.Text>Start Survey</Button.Text>
          </Button>
        </Card.Footer>
      </Card>
    ))}
  </Stack>
);
