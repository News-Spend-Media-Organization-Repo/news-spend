import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { MinusCircle, PlusCircle } from "@tamagui/lucide-icons";
import { useQuery } from "@tanstack/react-query";
import { startOfWeek } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { NativeAd, TestIds } from "react-native-google-mobile-ads";
import { Card, ScrollView, Stack, XStack } from "tamagui";
import { CaretLeft } from "tamagui-phosphor";

import { DialogWithAd } from "#/components/discover/DialogWithAd";
import { Screen } from "#/components/Screen";
import { Button, Text } from "#/components/ui";
import { orpc } from "#/lib/orpc";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

const GetTicket = () => {
  const navigation = useNavigation("GetTicket");
  const [value, setValue] = useState(0);
  const [open, setOpen] = useState(false);
  const [preloadedNativeAd, setPreloadedNativeAd] = useState<NativeAd | null>(
    null
  );
  const totalPoints = useQuery(orpc.activity.totalPoints.queryOptions());
  const { data: currentLottery } = useQuery(
    orpc.lottery.current.queryOptions()
  );
  const [decrementInterval, setDecrementInterval] = useState<NodeJS.Timeout>();
  const [incrementInterval, setIncrementInterval] = useState<NodeJS.Timeout>();

  const insets = useSafeAreaInsetsStyle(["bottom", "top"]);

  // Preload native ad on mount
  useEffect(() => {
    NativeAd.createForAdRequest(TestIds.GAM_NATIVE)
      .then(setPreloadedNativeAd)
      .catch(() => {
        // Silently fail - dialog will show custom ad fallback
      });
  }, []);

  useFocusEffect(
    useCallback(
      () => () => {
        setValue(0);
      },
      []
    )
  );

  const onTicketPress = () => {
    if (
      (totalPoints?.data ?? 0) >=
      value * (currentLottery?.ticketPrice ?? 50)
    ) {
      setOpen(true);
    } else {
      Alert.alert(
        "Not enough points",
        `You don't have enough points to buy ${value} ticket${value > 1 ? "s" : ""}. You currently have ${totalPoints.data} points.`
      );
    }
  };

  // Get the start of the current two-week period (Monday)
  const now = new Date();
  const startOfLotteryPeriod = startOfWeek(now, { weekStartsOn: 1 });
  if (startOfLotteryPeriod.getDate() - now.getDate() <= 7) {
    startOfLotteryPeriod.setDate(startOfLotteryPeriod.getDate() + 7);
  }

  return (
    <Screen
      bg="$p300"
      contentContainerStyle={insets}
      gap="$4"
      systemBarStyle="light"
    >
      <XStack ai="center" gap="$2.5" px="$2">
        <Button
          gap="$2"
          ghost
          h="auto"
          onPress={() => navigation.goBack()}
          p="$0"
          py="$2"
        >
          <Button.Icon color="#fff">
            <CaretLeft />
          </Button.Icon>
          <Button.Text color="#fff" fos="$4">
            Buy Lottery Tickets
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

      <ScrollView gap="$5" px="$4">
        <Stack gap="$4">
          <Text color="$s50" fos="$7" lh="$7" ta="center">
            Win a Laptop, Phone, More points, and other household items
          </Text>

          <Card bg="$s300" mx="$2" px="$6">
            <Card.Header>
              <Text color="$p400" ta="center">
                The{" "}
                {currentLottery?.name ??
                  startOfLotteryPeriod.toLocaleDateString().split("/")}{" "}
                game
              </Text>
            </Card.Header>
            <XStack>
              <XStack
                ai="center"
                als="center"
                boc="$p400"
                borderBottomLeftRadius="$10"
                borderRightWidth="$0"
                borderTopLeftRadius="$10"
                borderWidth={1}
                flex={1}
                jc="center"
                minHeight={50}
              >
                <Button
                  disabled={value === 0}
                  onLongPress={() => {
                    const intervalId = setInterval(() => {
                      setValue((v) => {
                        if (v <= 0) {
                          clearInterval(intervalId);
                          return 0;
                        }
                        return v - 1;
                      });
                    }, 200);

                    setDecrementInterval(intervalId);
                  }}
                  onPress={() => setValue(value - 1)}
                  onPressOut={() => {
                    clearInterval(decrementInterval);
                  }}
                  style={{
                    width: 46,
                    // height: 50,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  unstyled
                >
                  <Button.Icon color="$p500" height={14} width={14}>
                    <MinusCircle />
                  </Button.Icon>
                </Button>

                <XStack ai="center">
                  <Text
                    fontSize="$7"
                    fontWeight="500"
                    minWidth={34}
                    px="$2"
                    ta="center"
                  >
                    {value}
                  </Text>
                  <Text color="$gray.50" fos={15}>
                    Tickets
                  </Text>
                </XStack>

                <Button
                  onLongPress={() => {
                    const intervalId = setInterval(() => {
                      setValue((v) => {
                        if (v >= 100) {
                          clearInterval(intervalId);
                          return 100;
                        }
                        return v + 1;
                      });
                    }, 200);

                    setIncrementInterval(intervalId);
                  }}
                  onPress={() => setValue(value + 1)}
                  onPressOut={() => {
                    clearInterval(incrementInterval);
                  }}
                  style={{
                    width: 46,
                    // height: 50,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  unstyled
                >
                  <Button.Icon color="$p500" height={14} width={14}>
                    <PlusCircle />
                  </Button.Icon>
                </Button>
              </XStack>
              <Button
                bblr="$0"
                bbrr="$10"
                blw={0}
                boc="$p500"
                borderBottomRightRadius="$10"
                borderTopRightRadius="$10"
                btlr="$0"
                btrr="$10"
                bw={1}
                disabled={value <= 0 || totalPoints.isPending}
                h={50}
                onPress={onTicketPress}
                w="$7"
              >
                <Button.Text>Go</Button.Text>
              </Button>
            </XStack>

            <Card.Footer my="$3">
              <XStack flex={1} gap="$2" jc="center">
                <Text color="$p400">
                  Required points: {value * (currentLottery?.ticketPrice ?? 50)}{" "}
                  points
                </Text>
              </XStack>
            </Card.Footer>
          </Card>
        </Stack>

        <Text color="$p50" fos={15} mt="$2">
          Tips: {"\n"}Buy 10 or more tickets and your win ratio increases to
          more than 50%.
        </Text>
      </ScrollView>
      <DialogWithAd
        open={open}
        preloadedNativeAd={preloadedNativeAd}
        purchasedTickets={value}
        setOpen={setOpen}
      />
    </Screen>
  );
};
export default GetTicket;
