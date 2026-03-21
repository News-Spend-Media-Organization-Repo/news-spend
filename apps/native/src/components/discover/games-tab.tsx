import { useNavigation } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { Paragraph, Stack, Text, XStack } from "tamagui";
import { useSnapshot } from "valtio";

import { Image } from "#/components/ui";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { authState } from "#/state/auth";

const tasks = [
  "Play and Reach Level 10",
  "Download and Complete the Tutorial",
  "Play and Finish Level 5",
  "Complete your first purchase in the game",
  "Make it to level 10 today!",
  "Achieve 1000 points in the game",
  "Complete the tutorial",
];

export function GamesTab() {
  const { user } = useSnapshot(authState);
  const navigation = useNavigation();
  const { data, isPending, refetch } = useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const page = Math.floor(Math.random() * 850) + 1;
      const res = await fetch(
        `https://feeds.gamepix.com/v2/json?sid=SW281&pagination=12&page=${page}`
      );
      const res_1 = await res.json();
      return res_1?.items ?? [];
    },
    select(data) {
      return data?.map((item) => ({
        ...item,
        task: tasks[Math.floor(Math.random() * tasks.length)],
      }));
    },
  });

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  const onItemClick = useCallback(
    (gameUrl?: string) => {
      if (!user || user.isAnonymous) {
        navigation.navigate("SignIn", { redirect: "SurveyTab" });
        return;
      }

      if (gameUrl) {
        navigation.navigate("SurveyWebView" as any, { url: gameUrl });
      }
    },
    [navigation, user]
  );

  const renderItem = ({ item, index }) => (
    <XStack
      ai="flex-start"
      gap="$2.5"
      onPress={() => onItemClick(item.url)}
      p="$3"
    >
      <Image br="$3" height={80} source={{ uri: item.image }} width={80} />
      <Stack flex={1} h="100%" jc="space-between">
        <Stack>
          <Paragraph fos="$5" fow="600" numberOfLines={2}>
            {item.title}
          </Paragraph>
          <Text color="$gray.50" numberOfLines={2}>
            {item.task}
          </Text>
        </Stack>

        <Stack
          als="flex-end"
          bg="$color.s300"
          br="$10"
          fd="row"
          h="auto"
          px="$2"
          py="$1"
        >
          <Text color="white" fos="$3">
            {Math.floor(Math.random() * (200 - 50 + 1)) + 50} points
          </Text>
        </Stack>
      </Stack>
    </XStack>
  );

  return (
    <FlashList
      contentContainerStyle={{
        paddingBottom: 25,
      }}
      data={data}
      estimatedItemSize={100}
      ListEmptyComponent={isPending ? <Text>Loading...</Text> : null}
      onRefresh={refetchByUser}
      refreshing={isRefetchingByUser}
      renderItem={renderItem}
    />
  );
}
