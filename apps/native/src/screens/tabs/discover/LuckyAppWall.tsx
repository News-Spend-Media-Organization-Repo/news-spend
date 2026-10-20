import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { PartnerContent } from "@news-spend-media/payload/types";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSnapshot } from "valtio";

import { ScreenHeader } from "#/components";
import { Image } from "#/components/heroui/image";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { usePartnerClick } from "#/hooks/usePartnerClick";
import { useRefreshByUser } from "#/hooks/useRefreshByUser";
import { orpc } from "#/lib/orpc";
import { authState } from "#/state/auth";
import { getImageData } from "#/utils/getImageData";

export const LUCKY_WALL_EMPTY_MESSAGE =
  "You've done every Featured Offer for now. Check back later for new ones.";

const POOL_SIZE = 50;
const VISIBLE_COUNT = 10;

function pickRandom<T>(items: readonly T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = a;
  }
  return copy.slice(0, count);
}

function LuckyAppWall() {
  const _navigation = useNavigation();

  // Per user: the list hides what this person has completed and marks what
  // they started, so a cached answer belongs to one account.
  const userId = useSnapshot(authState).user?.id ?? null;
  const input = {
    placement: ["lucky-app-wall" as const],
    type: ["app" as const, "book" as const, "survey" as const],
    limit: POOL_SIZE,
  };
  const queryOptions = orpc.partnerContent.filtered.queryOptions({
    input,
    queryKey: [...orpc.partnerContent.filtered.queryKey({ input }), { userId }],
  });

  const { data, isPending, refetch } = useQuery(queryOptions);
  const docs = data?.docs;
  // Stable for the lifetime of the loaded data: reshuffles only on new data.
  const items = useMemo(
    () => (docs ? pickRandom(docs, VISIBLE_COUNT) : undefined),
    [docs]
  );

  const { isRefetchingByUser, refetchByUser } = useRefreshByUser(refetch);

  const keyExtractor = useCallback((item: PartnerContent) => item.id, []);

  const emptyList = useCallback(
    () => (
      <View className="h-full items-center justify-center">
        <Text className="text-base">{LUCKY_WALL_EMPTY_MESSAGE}</Text>
      </View>
    ),
    []
  );

  const onRefresh = useCallback(() => {
    refetchByUser();
  }, [refetchByUser]);

  /**
   * The shared hook, not a local opener.
   *
   * This screen used to call `Linking.openURL` directly, which meant the one
   * surface that produces Featured Offers (section 8) recorded nothing when an offer
   * was opened. Section 8 counts partner-confirmed conversions, a conversion needs a
   * click id, and a click id only exists if `trackClick` ran. No Featured
   * Offer could ever be earned, and Tier 1 and Tier 2, which both require one,
   * were unreachable for everybody.
   *
   * Every other partner surface (the all, books and apps tabs) already uses
   * this hook. This one was the exception.
   */
  const { handleClick } = usePartnerClick();

  const renderAppItem = ({
    item,
  }: LegendListRenderItemProps<PartnerContent>) => {
    const { blurhash, url } = getImageData(item.media);

    return (
      <View
        className="flex-row items-start gap-2 p-3"
        onTouchEnd={() => handleClick(item, "lucky-app-wall")}
      >
        <Image
          className="h-20 w-20 rounded-lg"
          contentFit="contain"
          placeholder={{ blurhash }}
          source={{ uri: url ?? "" }}
        />
        <View className="flex-1 gap-2">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-base" numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <Text
            className="font-semibold text-gray-50 text-sm italic"
            numberOfLines={2}
          >
            {item.description}
          </Text>
          {"userState" in item && item.userState === "pending" ? (
            <Text className="self-start rounded-full bg-gray-200 px-2 py-1 text-gray-50 text-xs">
              Pending confirmation
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Screen className="pb-safe" statusBarStyle="light">
      <ScreenHeader title="Featured Offers" />

      <View className="flex-1">
        <LegendList
          data={items ?? []}
          estimatedItemSize={100}
          keyExtractor={keyExtractor}
          ListEmptyComponent={emptyList}
          onRefresh={onRefresh}
          recycleItems={false}
          refreshing={isRefetchingByUser}
          renderItem={renderAppItem}
        />
      </View>
    </Screen>
  );
}

export default LuckyAppWall;
