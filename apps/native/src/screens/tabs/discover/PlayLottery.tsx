import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
} from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { ChevronLeft } from "@tamagui/lucide-icons";
import { useQueries } from "@tanstack/react-query";
import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
} from "date-fns";
import { useCallback, useState } from "react";
import { H4, Separator, Square, Stack, XStack } from "tamagui";

import { Screen } from "#/components/Screen";
import { Button, Image, Text } from "#/components/ui";
import { orpc } from "#/lib/orpc";
import { authState } from "#/state/auth";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

const PlayLottery = () => {
  const navigation = useNavigation("PlayLottery");
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsetsStyle(["bottom", "top"]);
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

  // Only show the "left" suffix when there's an active countdown
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
    <Screen contentContainerStyle={{ paddingBottom: insets.paddingBottom }}>
      <XStack ai="center" bg="$p400" gap="$2.5" pt={insets.paddingTop} px="$2">
        <Button
          gap="$2"
          ghost
          h="auto"
          onPress={() => navigation.goBack()}
          p="$0"
          py="$2"
        >
          <Button.Icon color="#fff">
            <ChevronLeft />
          </Button.Icon>
          <Button.Text color="#fff" fos="$4">
            Lottery Tickets
          </Button.Text>
        </Button>
        <Text
          color="#fff"
          ml="auto"
          onPress={() => navigation.navigate("LotteryRules")}
        >
          Rules
        </Text>
      </XStack>
      <FlashList
        contentContainerStyle={{ paddingBottom: 80 }}
        data={purchaseLogQuery.data}
        ItemSeparatorComponent={() => <Separator />}
        ListHeaderComponent={
          <Stack gap="$4" mb="$4">
            <Stack bg="$p400" gap="$2" px="$2" py="$2">
              <Text color="$p50" fos="$6" ta="center">
                Win a Laptop, Phone, More points, and other household items
              </Text>
              <XStack gap="$2">
                <Square
                  bg="$p200"
                  borderWidth={1}
                  flex={1}
                  h="$6"
                  opacity={0.6}
                >
                  <Image
                    contentFit="contain"
                    source="https://www.pngall.com/wp-content/uploads/15/Apple-Watch-PNG-Photos.png"
                    style={{ width: "100%", height: "100%" }}
                  />
                </Square>
                <Square borderWidth={1} flex={1} h="$6">
                  <Image
                    contentFit="contain"
                    source="https://freebiehive.com/wp-content/uploads/2023/07/iphone-14-pro-png.jpg"
                    style={{ width: "100%", height: "100%" }}
                  />
                </Square>
                <Square borderWidth={1} flex={1} h="$6">
                  <Image
                    contentFit="contain"
                    source="https://w7.pngwing.com/pngs/263/706/png-transparent-gift-card-business-christmas-gift-gift-miscellaneous-ribbon-rectangle-thumbnail.png"
                    style={{ width: "100%", height: "100%" }}
                  />
                </Square>
                <Square borderWidth={1} flex={1} h="$6">
                  <Image
                    contentFit="contain"
                    source="https://png.pngtree.com/png-vector/20210521/ourmid/pngtree-golden-coins-stacks-lots-money-finance-business-profits-and-wealth-gold-png-image_3327583.jpg"
                    style={{ width: "100%", height: "100%" }}
                  />
                </Square>
              </XStack>
            </Stack>

            <Stack ai="center" jc="center">
              <Text fos="$4" fow="500">
                Countdown: {timeLeft}
                {showLeftSuffix ? " left" : ""}
              </Text>

              <Text fos="$6">
                Total Participants:{" "}
                <H4 color="$s500">{lotteryTicketQuery.data?.length ?? 0}</H4>
              </Text>
            </Stack>
          </Stack>
        }
        renderItem={({ item }) => (
          <XStack
            gap="$1"
            jc="space-between"
            key={item.lottery_tickets.id}
            p="$2"
          >
            <Text color="$p400">User: {item.users.username}</Text>
            <Text color="$s400">
              bought {item.lottery_tickets.count} ticket
              {+item.lottery_tickets.count > 1 ? "s" : ""}
            </Text>
          </XStack>
        )}
        scrollEnabled={false}
      />
      <Button
        bottom={insets.paddingBottom + 20}
        left={0}
        mx="$5"
        onPress={onTestLuckPress}
        pos="absolute"
        right={0}
      >
        <Button.Text>Test My Luck</Button.Text>
      </Button>
    </Screen>
  );
};

export default PlayLottery;
