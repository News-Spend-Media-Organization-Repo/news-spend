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
import { useCallback, useState } from "react";
import { View } from "react-native";
import { ScreenHeader } from "#/components";
import { Button } from "#/components/heroui/button";
import { Image } from "#/components/heroui/image";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";
import { authState } from "#/state/auth";

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
  const [lotteryTicketQuery, purchaseLogQuery, currentLotteryQuery] =
    useQueries({
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
    timeLeft = "No active lottery";
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

  const onTestLuckPress = () => {
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
            onPress={() => navigation.navigate("LotteryRules")}
          >
            Rules
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
      </View>

      {purchaseLogQuery.data?.map((item: any) => (
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

      <Button
        className="absolute right-5 bottom-safe-offset-2 left-5"
        onPress={onTestLuckPress}
      >
        <Button.Label>Enter Giveaway</Button.Label>
      </Button>
    </Screen>
  );
};

export default PlayLottery;
