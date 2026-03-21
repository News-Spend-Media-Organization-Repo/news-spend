import { useNavigation } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { Card, H3, Paragraph, Stack, XStack } from "tamagui";
import { useSnapshot } from "valtio";

import { Button, Text } from "#/components/ui";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc, type RouterOutputs } from "#/lib/orpc";
import { authState } from "#/state/auth";

type Offer = RouterOutputs["survey"]["offers"]["getOffers"][number];

const PROVIDER_COLORS: Record<string, string> = {
  cpx: "#4CAF50",
  rapido: "#2196F3",
  theorem: "#FF9800",
};

const PROVIDER_NAMES: Record<string, string> = {
  cpx: "CPX",
  rapido: "Rapido",
  theorem: "Theorem",
};

export function SurveyTab() {
  const navigation = useNavigation("DiscoverHome");
  const { user } = useSnapshot(authState);

  const surveyQuery = useQuery(
    orpc.survey.offers.getOffers.queryOptions({
      input: { limit: 20 },
      staleTime: 60 * 1000,
    })
  );

  const offers = ((surveyQuery.data ?? []) as Offer[]).sort(
    (a, b) => b.points - a.points
  );
  const topRatedSurvey = offers.length ? offers[0] : null;
  const otherSurveys = offers.slice(1);

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(
    surveyQuery.refetch
  );

  const handleStartSurvey = useCallback(
    (offer: Offer) => {
      if (!user || user.isAnonymous) {
        navigation.navigate("SignIn", { redirect: "SurveyTab" } as never);
        return;
      }

      if (offer.url) {
        navigation.navigate("SurveyWebView", {
          url: offer.url,
          title: offer.title,
        });
      }
    },
    [navigation, user]
  );

  const renderSurveyCard = useCallback(
    ({ item, index }: { item: Offer; index: number }) => (
      <Card
        br="$3"
        elevate
        flex={1}
        gap="$4"
        mb="$3"
        ml={index % 2 === 0 ? "0" : "$2"}
        mr={index % 2 === 0 ? "$2" : "0"}
        p="$3"
      >
        <Card.Header gap="$1" p="$0">
          <XStack ai="center" jc="space-between">
            <Text fos="$3" fow="600" numberOfLines={1}>
              {item.title}
            </Text>
            <Text
              bg={PROVIDER_COLORS[item.provider] || "$gray5"}
              br="$2"
              color="white"
              fos="$2"
              px="$1"
            >
              {PROVIDER_NAMES[item.provider]}
            </Text>
          </XStack>
          <Text color="$gray.50" fos="$3">
            {item.description || `${item.estimatedTime || "?"} mins`}
          </Text>
          <Paragraph fos="$6" fow="700">
            {item.points} pts
          </Paragraph>
        </Card.Header>
        <Card.Footer>
          <Button onPress={() => handleStartSurvey(item)}>
            <Button.Text>Start Survey</Button.Text>
          </Button>
        </Card.Footer>
      </Card>
    ),
    [handleStartSurvey]
  );

  const renderTopRatedCard = useCallback(() => {
    if (!topRatedSurvey) return null;

    if (!user) {
      return (
        <Stack ai="center" bg="$s200" br="$3" gap="$3.5" mb="$6" p="$3">
          <XStack als="flex-start" gap={4}>
            <Text bg="$p400" br="$10" color="#fff" fos="$3" px="$2">
              Guest Preview
            </Text>
          </XStack>

          <Stack ai="center" jc="center">
            <H3>{topRatedSurvey.points} Points</H3>
            <Text color="$gray.50">
              {topRatedSurvey.description ||
                `${topRatedSurvey.estimatedTime || "?"} mins`}
            </Text>
          </Stack>

          <Button
            als="stretch"
            onPress={() =>
              navigation.navigate(
                "SignIn" as never,
                { redirect: "SurveyTab" } as never
              )
            }
          >
            <Button.Text>Sign In to Take Survey</Button.Text>
          </Button>
        </Stack>
      );
    }

    return (
      <Stack ai="center" bg="$s200" br="$3" gap="$3.5" mb="$6" p="$3">
        <XStack als="flex-start" gap={4}>
          <Text bg="$p400" br="$10" color="#fff" fos="$3" px="$2">
            Top Rated
          </Text>
          <Text
            bg={PROVIDER_COLORS[topRatedSurvey.provider] || "$gray5"}
            br="$10"
            color="#fff"
            fos="$2"
            px="$2"
          >
            {PROVIDER_NAMES[topRatedSurvey.provider]}
          </Text>
        </XStack>

        <Stack ai="center" jc="center">
          <H3>{topRatedSurvey.points} Points</H3>
          <Text color="$gray.50">
            {topRatedSurvey.description ||
              `${topRatedSurvey.estimatedTime || "?"} mins`}
          </Text>
        </Stack>

        <Button als="stretch" onPress={() => handleStartSurvey(topRatedSurvey)}>
          <Button.Text>Start Survey</Button.Text>
        </Button>
      </Stack>
    );
  }, [topRatedSurvey, handleStartSurvey, navigation, user]);

  return (
    <Stack flex={1}>
      <FlashList
        contentContainerStyle={{ padding: 15 }}
        data={otherSurveys}
        keyExtractor={(item) => item?.id ?? ""}
        ListEmptyComponent={
          surveyQuery.isPending ? (
            <Stack ai="center" py="$10">
              <Text>Loading offers...</Text>
            </Stack>
          ) : !user && offers.length > 0 ? (
            <Stack ai="center" flex={1} gap="$2" jc="center" p="$4" w="100%">
              <Text fow="600" textAlign="center">
                Sign in to earn points by completing surveys
              </Text>
              <Button
                onPress={() =>
                  navigation.navigate(
                    "SignIn" as never,
                    { redirect: "SurveyTab" } as never
                  )
                }
              >
                <Button.Text>Sign In</Button.Text>
              </Button>
            </Stack>
          ) : offers.length === 0 ? (
            <Stack ai="center" flex={1} gap="$2" jc="center" p="$4" w="100%">
              <Text fow="600" textAlign="center">
                No offers available right now
              </Text>
              <Text color="$gray.50" textAlign="center">
                Check back later for new surveys
              </Text>
              <Button onPress={refetchByUser}>
                <Button.Text>Refresh</Button.Text>
              </Button>
            </Stack>
          ) : surveyQuery.isError ? (
            <Stack ai="center" flex={1} gap="$2" jc="center" p="$4" w="100%">
              <Text fow="600" textAlign="center">
                Error loading surveys. Please try again later.
              </Text>
              <Button onPress={refetchByUser}>
                <Button.Text>Retry</Button.Text>
              </Button>
            </Stack>
          ) : null
        }
        ListHeaderComponent={renderTopRatedCard()}
        numColumns={2}
        onRefresh={refetchByUser}
        refreshing={isRefetchingByUser}
        renderItem={renderSurveyCard}
      />
    </Stack>
  );
}
