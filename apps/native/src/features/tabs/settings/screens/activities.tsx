import type { Activity } from "@news-spend-media/payload/types";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { addDays, format, subDays } from "date-fns";
import { useCallback, useState } from "react";
import {
  Accordion,
  Adapt,
  Paragraph,
  Select,
  Separator,
  Sheet,
  Spinner,
  Square,
  Stack,
  Text,
  ToggleGroup,
  XStack,
  YStack,
} from "tamagui";
import { CaretDown, Check } from "tamagui-phosphor";

import { DateRangePicker } from "#/components/DateRangePicker";
import { Screen } from "#/components/Screen";
import { orpc, type RouterInputs } from "#/lib/orpc";
import { authState } from "#/state/auth";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

type ActivityType = RouterInputs["activity"]["byUserId"]["type"];

export default function Activities() {
  const [activityOption, setActivityOption] =
    useState<RouterInputs["activity"]["byUserId"]["category"]>("all");
  const [dateRange, setDateRange] = useState("today");
  const insets = useSafeAreaInsetsStyle(["bottom"]);

  const [endDate, setEndDate] = useState(addDays(new Date(), 1));
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());

  const [toggle, setToggle] = useState<ActivityType>("posted");
  const [openDateDialog, setOpenDateDialog] = useState(false);

  const activities = useInfiniteQuery(
    orpc.activity.byUserId.infiniteOptions({
      input: (pageParam: number | undefined) => ({
        startDate: startDate?.toISOString().substring(0, 10),
        endDate: endDate.toISOString().substring(0, 10),
        category: activityOption,
        type: toggle,
        limit: 9,
        page: pageParam,
      }),
      initialPageParam: undefined,
      enabled: !!authState.user,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      // enabled: false,
    })
  );

  const allPages = activities.data?.pages.flatMap((page) => page?.docs) ?? [];

  const onCustomFilter = (startDate: Date, endDate: Date) => {
    setStartDate(startDate);
    setEndDate(endDate);
    setDateRange("custom");
    setOpenDateDialog(false);
  };

  const renderItem: ListRenderItem<Activity> = useCallback(
    ({ item }) => (
      <Accordion.Item key={item.id} value={item.id}>
        <Accordion.Trigger ai="flex-start" fd="row">
          {({ open }: { open: boolean }) => (
            <XStack ai="flex-start" gap="$3" jc="space-between">
              <Square animation="medium" rotate={open ? "-180deg" : "-90deg"}>
                <CaretDown size="$1" />
              </Square>
              <YStack>
                <Text fontSize="$3">
                  {format(new Date(item.createdAt), "dd/MM/yyyy")}
                </Text>
                <Text fontSize="$3">
                  {format(new Date(item.createdAt), "hh:mm a")}
                </Text>
              </YStack>
              <Paragraph flex={1} numberOfLines={1}>
                {item.description}
              </Paragraph>
              <Paragraph>
                {item.point > 0 ? "+" : null}
                {item.point} pts
              </Paragraph>
            </XStack>
          )}
        </Accordion.Trigger>
        <Accordion.Content bg="#f2f2f2" gap="$2">
          <XStack flex={1} gap="$4" jc="space-between">
            <YStack w="50%">
              <Paragraph fontSize="$3" textTransform="uppercase">
                Activity ID
              </Paragraph>
              <Paragraph flex={1} numberOfLines={1}>
                {item.id}
              </Paragraph>
            </YStack>

            <YStack w="50%">
              <Paragraph fontSize="$3" textTransform="uppercase">
                Date
              </Paragraph>
              <Paragraph>
                {format(new Date(item.createdAt), "dd/MM/yyyy")}
              </Paragraph>
            </YStack>
          </XStack>
          <XStack gap="$4" jc="space-between">
            <YStack w="50%">
              <Paragraph fontSize="$3" textTransform="uppercase">
                Description
              </Paragraph>
              <Paragraph>{item.description}</Paragraph>
            </YStack>

            <YStack w="50%">
              <Paragraph fontSize="$3" textTransform="uppercase">
                Points {item.point > 0 ? "Earned" : "Spent"}
              </Paragraph>
              <Paragraph>
                {item.point > 0 ? "+" : null}
                {item.point} pts
              </Paragraph>
            </YStack>
          </XStack>
        </Accordion.Content>
      </Accordion.Item>
    ),
    []
  );

  const onChange = useCallback((value: string) => {
    setActivityOption(
      value as RouterInputs["activity"]["byUserId"]["category"]
    );
  }, []);

  const onFilter = useCallback((value: Range) => {
    if (value === "custom") {
      setOpenDateDialog(true);
      return;
    }

    setDateRange(value);
    switch (value) {
      case "today":
        setStartDate(new Date());
        setEndDate(addDays(new Date(), 1));
        break;

      case "yesterday":
        setStartDate(subDays(new Date(), 1));
        setEndDate(new Date());
        break;

      case "last-7-days":
        setStartDate(subDays(new Date(), 7));
        setEndDate(addDays(new Date(), 1));
        break;

      case "last-30-days":
        setStartDate(subDays(new Date(), 30));
        setEndDate(addDays(new Date(), 1));
        break;

      default:
        break;
    }
  }, []);

  const onEndReached = useCallback(() => {
    if (activities.hasNextPage && !activities.isFetchingNextPage) {
      activities.fetchNextPage();
    }
  }, [activities]);

  return (
    <Screen safeAreaEdges={["bottom"]}>
      <Accordion borderRadius="$3" flex={1} overflow="hidden" type="multiple">
        <FlashList
          contentContainerStyle={{ paddingHorizontal: 15, paddingBottom: 15 }}
          data={allPages ?? []}
          estimatedItemSize={100}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            activities.isPending ? (
              <Stack mt="$3">
                <Spinner />
              </Stack>
            ) : (
              <Text>No activities for this period</Text>
            )
          }
          ListFooterComponent={
            activities.isFetchingNextPage ? <Spinner /> : null
          }
          // ItemSeparatorComponent={() => <Separator />}
          ListHeaderComponent={
            <YStack gap="$4" my="$3">
              <XStack gap="$2.5">
                <Select
                  disablePreventBodyScroll
                  id="ActivityOptions"
                  onValueChange={onChange}
                  value={activityOption}
                >
                  <Select.Trigger
                    flex={1}
                    iconAfter={<CaretDown size="$1.5" />}
                  >
                    <Select.Value placeholder="Activity" />
                  </Select.Trigger>

                  <Adapt platform="touch" when="sm">
                    <Sheet
                      animationConfig={{
                        type: "spring",
                        damping: 20,
                        mass: 1.2,
                        stiffness: 250,
                      }}
                      dismissOnSnapToBottom
                      modal
                      snapPointsMode="fit"
                    >
                      <Sheet.Frame pb={insets.paddingBottom}>
                        <Sheet.ScrollView>
                          <Adapt.Contents />
                        </Sheet.ScrollView>
                      </Sheet.Frame>
                      <Sheet.Overlay
                        animation="fast"
                        bg="rgba(0,0,0,0.5)"
                        enterStyle={{ opacity: 0.5 }}
                        exitStyle={{ opacity: 0 }}
                        opacity={0.5}
                      />
                    </Sheet>
                  </Adapt>

                  <Select.Content zIndex={2000}>
                    <Select.Viewport
                      animateOnly={["transform", "opacity"]}
                      animation="quick"
                      enterStyle={{ o: 0, y: -10 }}
                      exitStyle={{ o: 0, y: 10 }}
                      minWidth={200}
                    >
                      <Select.Group>
                        <Select.Label>Choose an option</Select.Label>
                        {ActivityOptions.map((item, i) => (
                          <>
                            <Separator />
                            <Select.Item
                              index={i}
                              key={item.name}
                              value={item.value!}
                            >
                              <Select.ItemText>{item.name}</Select.ItemText>
                              <Select.ItemIndicator marginLeft="auto">
                                <Check size={24} />
                              </Select.ItemIndicator>
                            </Select.Item>
                          </>
                        ))}
                      </Select.Group>
                    </Select.Viewport>
                  </Select.Content>
                </Select>
                <Select
                  disablePreventBodyScroll
                  id="dateRange"
                  onValueChange={onFilter}
                  value={dateRange}
                >
                  <Select.Trigger
                    flex={1}
                    iconAfter={<CaretDown size="$1.5" />}
                  >
                    <Select.Value placeholder="Date Range" />
                  </Select.Trigger>

                  <Adapt platform="touch" when="sm">
                    <Sheet
                      animationConfig={{
                        type: "spring",
                        damping: 20,
                        mass: 1.2,
                        stiffness: 250,
                      }}
                      dismissOnSnapToBottom
                      modal
                      snapPointsMode="fit"
                    >
                      <Sheet.Frame pb={insets.paddingBottom}>
                        <Sheet.ScrollView>
                          <Adapt.Contents />
                        </Sheet.ScrollView>
                      </Sheet.Frame>
                      <Sheet.Overlay
                        animation="fast"
                        bg="rgba(0,0,0,0.5)"
                        enterStyle={{ opacity: 0.5 }}
                        exitStyle={{ opacity: 0 }}
                        opacity={0.5}
                      />
                    </Sheet>
                  </Adapt>

                  <Select.Content zIndex={2000}>
                    <Select.Viewport
                      animateOnly={["transform", "opacity"]}
                      animation="quick"
                      enterStyle={{ o: 0, y: -10 }}
                      exitStyle={{ o: 0, y: 10 }}
                      minWidth={200}
                    >
                      <Select.Group>
                        <Select.Label>Choose an option</Select.Label>
                        {DateRangeOptions.map((item, i) => (
                          <>
                            <Separator />
                            <Select.Item
                              index={i}
                              key={item.name}
                              value={item.value}
                            >
                              <Select.ItemText>{item.name}</Select.ItemText>
                              <Select.ItemIndicator marginLeft="auto">
                                <Check size={20} />
                              </Select.ItemIndicator>
                            </Select.Item>
                          </>
                        ))}
                      </Select.Group>
                    </Select.Viewport>
                  </Select.Content>
                </Select>
              </XStack>
              <XStack alignItems="center" gap="$4" justifyContent="center">
                <ToggleGroup
                  disableDeactivation
                  onValueChange={(value) => setToggle(value as ActivityType)}
                  type="single"
                  value={toggle}
                >
                  <ToggleGroup.Item
                    aria-label="Posted"
                    backgroundColor={
                      toggle === "posted" ? "$p100" : "transparent"
                    }
                    flex={1}
                    value="posted"
                  >
                    <Paragraph>Posted</Paragraph>
                  </ToggleGroup.Item>
                  <ToggleGroup.Item
                    aria-label="Visited"
                    backgroundColor={
                      toggle === "visited" ? "$p100" : "transparent"
                    }
                    flex={1}
                    value="visited"
                  >
                    <Paragraph>Visited</Paragraph>
                  </ToggleGroup.Item>
                  <ToggleGroup.Item
                    aria-label="Pending"
                    backgroundColor={
                      toggle === "pending" ? "$p100" : "transparent"
                    }
                    flex={1}
                    value="pending"
                  >
                    <Paragraph>Pending</Paragraph>
                  </ToggleGroup.Item>
                </ToggleGroup>
              </XStack>
            </YStack>
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          renderItem={renderItem}
        />
      </Accordion>

      <DateRangePicker
        onDateFilter={onCustomFilter}
        open={openDateDialog}
        setOpen={setOpenDateDialog}
      />
    </Screen>
  );
}

const ActivityOptions: {
  name: string;
  value: RouterInputs["activity"]["byUserId"]["category"];
}[] = [
  { name: "All", value: "all" },
  { name: "Shopping and Purchases", value: "shopping-and-purchase" },
  { name: "Referrals", value: "referrals" },
  { name: "Reward History", value: "reward-history" },
];

const DateRangeOptions: {
  name: string;
  value: Range;
}[] = [
  { name: "Today", value: "today" },
  { name: "Yesterday", value: "yesterday" },
  { name: "Last 7 Days", value: "last-7-days" },
  { name: "Last 30 Days", value: "last-30-days" },
  { name: "Custom Range", value: "custom" },
];

type Range = "today" | "yesterday" | "last-7-days" | "last-30-days" | "custom";
