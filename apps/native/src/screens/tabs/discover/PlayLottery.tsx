import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
} from "@react-navigation/native";
import { useQueries } from "@tanstack/react-query";
import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
} from "date-fns";
import { LinkButton } from "heroui-native";
import { useCallback, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSnapshot } from "valtio";
import { ScreenHeader } from "#/components";
import { Button } from "#/components/heroui/button";
import { Image } from "#/components/heroui/image";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";
import { authState } from "#/state/auth";

const MAX_PARTICIPANTS_SHOWN = 20;

const prizes = [
  {
    uri: "https://www.pngall.com/wp-content/uploads/15/Apple-Watch-PNG-Photos.png",
    key: "watch",
  },
  {
    uri: "https://freebiehive.com/wp-content/uploads/2023/07/iphone-14-pro-png.jpg",
    key: "iphone",
  },
  {
    uri: "https://w7.pngwing.com/pngs/263/706/png-transparent-gift-card-business-christmas-gift-gift-miscellaneous-ribbon-rectangle-thumbnail.png",
    key: "gift-card",
  },
  {
    uri: "https://png.pngtree.com/png-vector/20210521/ourmid/pngtree-golden-coins-stacks-lots-money-finance-business-profits-and-wealth-gold-png-image_3327583.jpg",
    key: "coins",
  },
];

const PlayLottery = () => {
  const navigation = useNavigation("PlayLottery");
  const isFocused = useIsFocused();
  const { user } = useSnapshot(authState);
  const isLoggedInNonGuest = !!user && !user.isAnonymous;

  const [
    lotteryTicketQuery,
    purchaseLogQuery,
    currentLotteryQuery,
    myTicketQuery,
  ] = useQueries({
    queries: [
      orpc.lotteryTicket.get.queryOptions({
        refetchInterval: 50_000,
        enabled: isFocused,
      }),
      orpc.lotteryTicket.purchaseLog.queryOptions({
        refetchInterval: 50_000,
        enabled: isFocused,
      }),
      orpc.lottery.current.queryOptions({
        refetchInterval: 60_000,
        enabled: isFocused,
      }),
      orpc.lotteryTicket.getByUser.queryOptions({
        refetchInterval: 50_000,
        enabled: isFocused && isLoggedInNonGuest,
      }),
    ],
  });

  const [now, setNow] = useState(() => new Date());

  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(() => {
        setNow(new Date());
      }, 1000);
      return () => clearInterval(interval);
    }, [])
  );

  const currentLottery = currentLotteryQuery.data;
  const isLoading = currentLotteryQuery.isLoading;
  const endDate = currentLottery?.endDate
    ? new Date(currentLottery.endDate)
    : null;
  const hasEnded = endDate ? now >= endDate : false;

  const daysLeft = endDate ? differenceInDays(endDate, now) : 0;
  const hoursLeft = endDate ? differenceInHours(endDate, now) % 24 : 0;
  const minutesLeft = endDate ? differenceInMinutes(endDate, now) % 60 : 0;

  let timeLeft: string;
  if (isLoading) {
    timeLeft = "Loading...";
  } else if (!currentLottery) {
    timeLeft = "No active giveaway";
  } else if (hasEnded) {
    timeLeft = "Ended";
  } else if (daysLeft > 0) {
    timeLeft = `${daysLeft}d ${hoursLeft}h`;
  } else if (hoursLeft > 0) {
    timeLeft = `${hoursLeft}h ${minutesLeft}m`;
  } else {
    timeLeft = `${minutesLeft}m`;
  }

  const showLeftSuffix = !(isLoading || !currentLottery || hasEnded);
  const hasActiveLottery = !isLoading && Boolean(currentLottery) && !hasEnded;
  const enterButtonLabel = isLoading
    ? "Loading..."
    : currentLottery
      ? hasEnded
        ? "Giveaway Ended"
        : "Enter Giveaway"
      : "No Active Giveaway";

  const participants =
    purchaseLogQuery.data?.slice(0, MAX_PARTICIPANTS_SHOWN) ?? [];
  const myTicket = myTicketQuery.data;
  const isCurrentUserListed = participants.some(
    (item: any) => item.users?.id === user?.id
  );

  if (user?.id && myTicket && !isCurrentUserListed) {
    const selfEntry = {
      lottery_tickets: myTicket.lottery_tickets,
      users: { id: user.id, username: user.username ?? user.name },
    };
    participants.splice(
      Math.min(participants.length, MAX_PARTICIPANTS_SHOWN - 1),
      1,
      selfEntry
    );
  }

  const onTestLuckPress = () => {
    if (!hasActiveLottery) {
      return;
    }
    if (authState.user && !authState.user.isAnonymous) {
      navigation.navigate("GetTicket");
    } else {
      return navigation.navigate("SignIn", {
        redirect: "PlayLottery",
      });
    }
  };

  return (
    <Screen
      className=""
      SystemBarsProps={{
        style: {
          navigationBar: "dark",
          statusBar: "light",
        },
      }}
    >
      <ScreenHeader
        right={
          <Text
            className="text-white"
            onPress={() => navigation.navigate("MyPrizes")}
          >
            My Prizes
          </Text>
        }
        title="Giveaway"
      />

      <View className="mb-4 gap-4">
        <View className="gap-2 bg-p-500 px-2 py-2">
          <Text className="text-center text-lg text-p-50">
            Win Dream Points, airtime, data bundles, electronics, and other
            prizes
          </Text>
          <View className="flex-row gap-2">
            {prizes.map((prize, index) => (
              <View
                className="flex-1 border border-gray-400"
                key={prize.key}
                style={{ aspectRatio: 1 }}
              >
                <Image
                  className={index === 0 ? "opacity-60" : ""}
                  contentFit="contain"
                  source={{ uri: prize.uri }}
                  style={{ width: "100%", height: "100%" }}
                />
              </View>
            ))}
          </View>
        </View>

        <View className="items-center justify-center">
          <Text className="font-semibold text-lg">
            Countdown: {timeLeft}
            {showLeftSuffix ? " left" : ""}
          </Text>
          <Text className="text-xl">
            Total Participants:{" "}
            <Text className="font-bold text-s-500">
              {lotteryTicketQuery.data?.length ?? 0}
            </Text>
          </Text>
        </View>

        <View className="flex-row flex-wrap justify-center px-4">
          <Text className="text-gray-400 text-xs">
            Not sponsored, endorsed, or administered by{" "}
            {Platform.OS === "ios" ? "Apple Inc." : "Google LLC."}{" "}
          </Text>
          <LinkButton
            onPress={() => navigation.navigate("LotteryRules")}
            size="sm"
          >
            <LinkButton.Label className="text-p-400 text-xs underline">
              See Official Rules
            </LinkButton.Label>
          </LinkButton>
          <Text className="text-gray-400 text-xs">.</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-24"
        showsVerticalScrollIndicator={false}
      >
        {participants.map((item: any) => (
          <View
            className="border-gray-100 border-b"
            key={item.lottery_tickets?.id}
          >
            <View className="flex-row justify-between gap-1 p-2">
              <Text className="text-p-400">User: {item.users?.username}</Text>
              <Text className="text-s-400">
                entered {item.lottery_tickets?.count} ticket
                {+(item.lottery_tickets?.count ?? 0) > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <Button
        className="absolute right-5 bottom-safe-offset-2 left-5"
        isDisabled={!hasActiveLottery}
        onPress={onTestLuckPress}
      >
        <Button.Label>{enterButtonLabel}</Button.Label>
      </Button>
    </Screen>
  );
};

export default PlayLottery;
