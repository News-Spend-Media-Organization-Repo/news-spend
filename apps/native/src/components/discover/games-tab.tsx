import { useNavigation } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { Paragraph, Stack, Text, XStack } from "tamagui";
import { useSnapshot } from "valtio";

import { Image } from "#/components/ui";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { authState } from "#/state/auth";

export function GamesTab() {
  const { user } = useSnapshot(authState);
  const navigation = useNavigation();
  const { data, isPending, refetch } = useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const page = Math.floor(Math.random() * 850) + 1;
      const res = await fetch(
        `https://feeds.gamepix.com/v2/json?sid=SW281&pagination=12&page=${page}`,
      );
      const res_1 = await res.json();
      return res_1?.items ?? [];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  const onItemClick = useCallback(
    (gameUrl?: string, title?: string) => {
      if (!user || user.isAnonymous) {
        navigation.navigate("SignIn", { redirect: "SurveyTab" });
        return;
      }

      if (gameUrl) {
        navigation.navigate("SurveyWebView" as any, { url: gameUrl, type: "game", title });
      }
    },
    [navigation, user],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <XStack ai="flex-start" gap="$2.5" onPress={() => onItemClick(item.url, item.title)} p="$3">
        <Image br="$3" height={80} source={{ uri: item.image }} width={80} />
        <Stack flex={1} gap="$2">
          <Paragraph fos="$5" fow="600" numberOfLines={2}>
            {item.title}
          </Paragraph>
          <Paragraph color="$gray.50" fos="$4" numberOfLines={2}>
            {item.description}
          </Paragraph>
        </Stack>
      </XStack>
    ),
    [onItemClick],
  );

  return (
    <FlashList
      contentContainerStyle={{
        paddingBottom: 25,
      }}
      data={data}
      estimatedItemSize={120}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={isPending ? <Text>Loading...</Text> : null}
      onRefresh={refetchByUser}
      refreshing={isRefetchingByUser}
      renderItem={renderItem}
    />
  );
}
